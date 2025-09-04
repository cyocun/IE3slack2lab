/**
 * フロー入力検証
 * ユーザー入力の検証とフォーマット処理
 */

import { formatDateInput, isValidUrl, extractUrlFromSlackFormat } from "../utils/slack";
import { MessageUtils } from "../utils/messageFormatter";

/**
 * 日付入力の検証結果
 */
export interface DateValidationResult {
  isValid: boolean;
  formattedDate?: string;
  errorMessage?: string;
}

/**
 * リンク入力の検証結果
 */
export interface LinkValidationResult {
  isValid: boolean;
  processedLink?: string;
  errorMessage?: string;
}

/**
 * 日付入力を検証
 * @param input ユーザーが入力した日付文字列
 * @returns 検証結果
 */
export function validateDateInput(input: string): DateValidationResult {
  const formattedDate = formatDateInput(input);
  
  if (!formattedDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(formattedDate)) {
    return {
      isValid: false,
      errorMessage: MessageUtils.formatDateInvalid(input),
    };
  }

  return {
    isValid: true,
    formattedDate,
  };
}

/**
 * リンク入力を検証
 * @param input ユーザーが入力したリンク文字列
 * @returns 検証結果
 */
export function validateLinkInput(input: string): LinkValidationResult {
  const cleanInput = input.trim();

  if (!isValidUrl(cleanInput)) {
    return {
      isValid: false,
      errorMessage: MessageUtils.formatLinkInvalid(cleanInput),
    };
  }

  // "no"入力でスキップ、それ以外はSlackハイパーリンク形式からURLを抽出
  const processedLink = cleanInput.toLowerCase() === "no" 
    ? "" 
    : extractUrlFromSlackFormat(cleanInput);

  return {
    isValid: true,
    processedLink,
  };
}