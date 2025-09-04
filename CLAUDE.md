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
└── utils/
    ├── slack.ts          # Slack API utilities
    └── github.ts         # GitHub API utilities
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