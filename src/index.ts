import { Hono } from "hono";
import type { Bindings } from "./types";
import { verifySlackSignature } from "./utils/slack";
import {
  handleInitialImageUpload,
  handleFlowMessage,
} from "./handlers/flowHandler";
import { handleButtonInteraction } from "./handlers/buttonHandler";
import { MESSAGES } from "./constants";

const app = new Hono<{ Bindings: Bindings }>();

/**
 * イベント処理用メインSlack Webhookエンドポイント
 */
app.post("/slack/events", async (c) => {
  const env = c.env;

  try {
    const signature = c.req.header("X-Slack-Signature") ?? "";
    const timestamp = c.req.header("X-Slack-Request-Timestamp") ?? "";
    const bodyText = await c.req.text();

    // 署名検証
    if (
      !(await verifySlackSignature(
        signature,
        timestamp,
        bodyText,
        env.SLACK_SIGNING_SECRET,
      ))
    ) {
      return c.text(MESSAGES.ERRORS.UNAUTHORIZED, 401);
    }

    let body: any;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return bodyText.includes("Request for Retry")
        ? c.text("OK")
        : c.text(MESSAGES.ERRORS.INVALID_JSON, 400);
    }

    // URL検証
    if (body.type === "url_verification") {
      return c.text(body.challenge);
    }

    const event = body.event;

    // ボットメッセージを除外
    if (event.bot_id || event.type !== "message") {
      return c.text("OK");
    }

    // スレッドメッセージの場合
    if (event.thread_ts) {
      return handleFlowMessage(c, env, event);
    }

    // 通常メッセージ（画像付き）の場合
    return handleInitialImageUpload(c, env, event);
  } catch (error) {
    console.error("Unexpected error in Slack webhook:", error);
    return c.text(MESSAGES.ERRORS.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Slackインタラクティブエンドポイント（ボタン処理）
 */
app.post("/slack/interactive", async (c) => {
  const env = c.env;

  try {
    const signature = c.req.header("X-Slack-Signature") ?? "";
    const timestamp = c.req.header("X-Slack-Request-Timestamp") ?? "";
    const bodyText = await c.req.text();

    // 署名検証
    if (
      !(await verifySlackSignature(
        signature,
        timestamp,
        bodyText,
        env.SLACK_SIGNING_SECRET,
      ))
    ) {
      return c.text(MESSAGES.ERRORS.UNAUTHORIZED, 401);
    }

    const payloadParam = bodyText.split("payload=")[1];
    if (!payloadParam) {
      return c.text("Bad Request", 400);
    }

    const payload = JSON.parse(decodeURIComponent(payloadParam));

    if (payload.type === "block_actions") {
      return handleButtonInteraction(c, env, payload);
    }

    return c.text("OK");
  } catch (error) {
    console.error("Interactive endpoint error:", error);
    return c.text(MESSAGES.ERRORS.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * ヘルスチェックエンドポイント
 */
app.get("/", (c) => c.text("OK"));

export default app;
