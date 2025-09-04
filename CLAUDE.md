# Claude Code Configuration

This file contains configuration and instructions for Claude Code when working on this project.

## Project Overview

IE3 Slack to GitHub Lab Uploader - A Cloudflare Workers application that automatically uploads images from Slack to GitHub repositories with metadata management.

## Development Commands

### Build and Test
```bash
npm run typecheck    # TypeScript type checking
npm run build        # Build TypeScript to JavaScript
npm run test         # Run tests with Vitest
npm run format       # Format code with Prettier
```

### Development and Deployment
```bash
npm run dev          # Start local development server
npm run deploy       # Build and deploy to Cloudflare Workers
wrangler tail        # Monitor live logs
```

## Project Structure

```
src/
├── index.ts              # Main Hono application entry point
├── types.ts              # TypeScript type definitions
├── constants.ts          # Centralized constants and messages
├── handlers/
│   ├── flowHandler.ts    # Interactive flow processing
│   └── buttonHandler.ts  # Button interaction handling
├── flow/
│   ├── editHandlers.ts   # Edit and delete operations
│   ├── flowStates.ts     # Flow state management
│   ├── flowMessages.ts   # Message formatting
│   ├── flowValidation.ts # Input validation
│   └── uploadProcessor.ts # Upload processing logic
├── github/
│   ├── index.ts          # GitHub exports
│   ├── dataOperations.ts # JSON data operations
│   ├── uploadOperations.ts # File upload operations
│   ├── deleteOperations.ts # File deletion operations
│   ├── githubApi.ts      # GitHub API helpers
│   ├── urlBuilder.ts     # GitHub URL construction
│   └── types.ts          # GitHub-specific types
├── utils/
│   ├── slack.ts          # Slack API utilities
│   ├── kv.ts            # KV storage operations
│   ├── imageOptimizer.ts # Image processing
│   ├── messageFormatter.ts # Message formatting utilities
│   └── response.ts       # HTTP response helpers
└── ui/
    └── slackBlocks.ts    # Slack Block Kit templates
```

## Key Technologies

- **Framework**: Hono (lightweight web framework for Cloudflare Workers)
- **Runtime**: Cloudflare Workers
- **Language**: TypeScript
- **APIs**: Slack Events API, GitHub Contents API

## Environment Setup

### Required Secrets (set via wrangler CLI)
```bash
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_SIGNING_SECRET  
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_OWNER
wrangler secret put GITHUB_REPO
```

### Environment Variables (wrangler.toml)
```toml
[vars]
IMAGE_PATH = "mock-dir/public/images/"
JSON_PATH = "mock-dir/app/data/lab.json"
GITHUB_BRANCH = "develop"
```

## Code Style Guidelines

- Use TypeScript strict mode
- Follow existing code formatting (Prettier configured)
- Maintain consistency with Hono framework patterns
- Use proper error handling with try-catch blocks
- Include Japanese comments for user-facing messages

## Development Conventions and Best Practices

### 1. **Constants Management**
- **User-facing messages**: Only messages displayed to users (Slack messages, error messages, button labels) should be centralized in `constants.ts`
- **Internal program strings**: Technical strings used for program control ("OK", "danger", "warning", action IDs) should prioritize readability and be written inline for better code comprehension
- **Distinction criteria**: 
  - Constants: User-visible text, business logic messages, multilingual candidates
  - Inline: Technical constants, HTTP status codes, internal identifiers, API parameters
- **Categories**: Organize user-facing constants by logical groupings (MESSAGES, BUTTONS, PROMPTS, etc.)
- **Format**: Use `as const` for type safety and structure with clear naming
- **Examples**:
  ```typescript
  // ✅ Good - User-facing messages in constants
  export const MESSAGES = {
    ERRORS: {
      DATA_NOT_FOUND: "データがない🤔",
    },
    PROMPTS: {
      DATE_INPUT: "📅 *いつ？*\n`YYYY/MM/DD、YYYYMMDD、MMDD`",
    },
  } as const;
  
  // ✅ Good - Technical strings inline for readability
  return new Response("OK");
  await sendColoredSlackMessage(token, channel, threadTs, message, "danger");
  case "edit_date":
  ```

### 2. **File Organization Principles**
- **Single Responsibility**: Each file should have a clear, single purpose
- **Logical Grouping**: Related functionality should be in the same directory
- **Clear Naming**: File names should immediately indicate their purpose
- **No Hardcoding**: Never hardcode strings, numbers, or configurations in business logic

### 3. **Error Handling Standards**
- **Try-catch blocks**: MUST wrap all async operations and external API calls
- **User-friendly messages**: Error messages should be informative for users
- **Logging**: Log detailed error information for debugging
- **Graceful degradation**: Handle errors without breaking the entire flow

### 4. **GitHub API Usage**
- **Branch specification**: ALWAYS specify the target branch in ALL GitHub API calls
  - Use `?ref=branch_name` in URLs
  - Include `branch` field in request bodies for PUT/DELETE operations
- **Repository specification**: All GitHub operations must reference the correct repository
- **Consistency**: Use urlBuilder helper for all GitHub API URLs

### 5. **Slack Integration Guidelines**
- **Timeout handling**: Use `waitUntil()` for operations longer than 3 seconds
- **Immediate response**: Always return 200 OK to Slack within the timeout window
- **Background processing**: Heavy operations (uploads, deletions) must run in background
- **User feedback**: Provide immediate status messages ("⏳ Processing...") followed by completion messages

### 6. **TypeScript Best Practices**
- **Strict mode**: Always use TypeScript strict mode
- **Type definitions**: Define interfaces for all data structures
- **No any**: Avoid `any` type - use proper type definitions
- **Type imports**: Use `import type` for type-only imports

### 7. **Security Requirements**
- **Input validation**: Validate all user inputs before processing
- **Secret management**: Never commit secrets - use Wrangler secrets
- **Authentication**: Verify Slack signatures for all incoming requests
- **Bot filtering**: Exclude bot messages from processing

### 8. **Performance Guidelines**
- **Efficient operations**: Batch GitHub operations when possible
- **Memory management**: Clean up resources in image processing
- **Caching**: Use appropriate TTL for KV storage
- **Minimal payload**: Keep API responses lightweight

## Key Features

1. **Slack Integration**: Receives image uploads via Events API
2. **GitHub Upload**: Stores images and metadata in GitHub repository
3. **Message Parsing**: Parses Japanese format messages (タイトル:, 日付:, リンク:)
4. **Error Handling**: Comprehensive error reporting back to Slack
5. **Validation**: Date format and image type validation

## API Endpoints

- `GET /` - Health check endpoint
- `POST /slack/events` - Slack Events API webhook (main functionality)

## Common Issues and Solutions

1. **Date Format**: Ensure dates follow YYYY/MM/DD format exactly
2. **Image Types**: Only image/* MIME types are supported
3. **Bot Messages**: Bot messages are automatically filtered out
4. **GitHub Permissions**: Ensure GitHub token has 'repo' scope

## Testing and Debugging

- Use `wrangler tail` for real-time log monitoring
- Check Slack thread responses for detailed error messages
- Verify webhook URL configuration in Slack app settings
- Test with `npm run dev` before deploying

## Related Documentation

- See `SPECIFICATION.md` for detailed technical specifications
- See `README.md` for setup and usage instructions