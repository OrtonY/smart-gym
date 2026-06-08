# AI Conversation History Design

## Goal

Update AI interactions so user-facing AI plan and food-record flows happen in modal dialogs with loading feedback, entry-scoped history, new conversations, and context-aware continuation. After a successful AI operation the modal closes and the affected page refreshes or receives the recognized data.

This design covers:

- Training plan AI generation and adjustment.
- Nutrition plan AI generation and adjustment.
- Food record AI recognition.
- AI provider settings simplification for the existing single-config product shape.
- Pose AI advice loading feedback without moving it into a modal.

## Current State

The backend already persists `ai_conversations` and `ai_messages` for training and nutrition plan operations, but there are no general conversation list/detail APIs and no explicit client-controlled continuation by `conversation_id`. Current adjustment services choose the latest conversation for a plan automatically.

The frontend currently has mixed interaction models:

- Training plan global AI uses an inline panel.
- Training date AI adjustment is embedded inside the date edit modal.
- Nutrition plan AI uses a modal but separates generate and adjust forms.
- Food record separates AI recognition and manual input as modes.
- Pose advice stays inline with a text loading label.
- AI Provider settings use a multi-config list plus separate create/edit form even though the product supports one config in practice.

## Scope

### In Scope

- Add entry-scoped AI conversation history and continuation APIs.
- Add modal-based AI chat UI for training plans, nutrition plans, and food recognition.
- Support new conversations and continuing historical conversations with context.
- Add visible loading animation during AI calls.
- Close AI modal after successful AI operation.
- Simplify food recording into one manual record form with an AI assist button.
- Improve pose advice loading animation in place.
- Simplify AI Provider settings for one active config.

### Out of Scope

- A global AI coach center across all domains.
- Streaming AI responses.
- Multi-provider management UI.
- Real-time collaborative chat.
- Deleting conversation history unless already needed by existing code.

## Architecture

Use entry-scoped conversations. Each AI entry opens a modal that only reads and writes conversations for that entry:

- `training_plan`: scoped by `training_plan_id`.
- `nutrition_plan`: scoped by `nutrition_plan_id`.
- `food_record`: scoped to the current user and food recording entry.

The backend continues using `AiConversation` and `AiMessage`. New service and route functions expose:

- List conversations by topic and optional linked object.
- Read a conversation with ordered messages.
- Send a message to either a new conversation or an existing conversation.

Continuation is explicit. When the frontend sends a message with `conversation_id`, the backend validates:

- The conversation belongs to the current user.
- The conversation topic matches the entry.
- The linked plan id matches when a plan is involved.

The service then reads existing messages, builds provider context from message history plus current domain state, calls AI, saves the new user and assistant messages, applies the domain result, and returns the updated conversation plus the domain result.

## Backend API Design

Add AI conversation schemas:

- `AiConversationSummaryResponse`
  - `id`
  - `topic`
  - `training_plan_id`
  - `nutrition_plan_id`
  - `title`
  - `created_at`
  - `updated_at`
  - `last_message_preview`
- `AiMessageResponse`
  - `id`
  - `conversation_id`
  - `role`
  - `content`
  - `provider_type`
  - `model_name`
  - `metadata_json`
  - `created_at`
- `AiConversationDetailResponse`
  - summary fields
  - `messages`

Add routes under `/api/ai-conversations`:

- `GET /api/ai-conversations?topic=training_plan&training_plan_id=1`
- `GET /api/ai-conversations/{conversation_id}`

Extend AI operation payloads to support continuation:

- Training generate: optional `conversation_id`.
- Training adjust: optional `conversation_id`.
- Nutrition generate: optional `conversation_id`.
- Nutrition adjust: optional `conversation_id`.
- Food recognition: optional `conversation_id`, text description, optional image.

Existing routes can be preserved and enhanced instead of replaced. This keeps current tests and call sites stable while allowing the new modal to pass `conversation_id`.

## Context Handling

For a continued conversation, the AI prompt includes:

- Recent ordered conversation messages from the selected conversation.
- Current domain state:
  - Training: current plan items and optional target date context.
  - Nutrition: current meal plan items.
  - Food record: current recognition request, image when provided, and any prior food recognition messages.
- The new user message.

The assistant message content should remain concise enough for the UI but still contain structured result metadata in `metadata_json`. Existing JSON plan result content can continue to be stored, but the UI should render a readable summary when the content is structured JSON.

## Frontend Interaction Design

Create a reusable AI conversation modal component with these states:

- `history`: shows a top tab named `历史续聊`.
- `new`: shows a top tab named `新建对话`.
- `loading`: shows spinner or pulse animation in the message area and disables send, tab switching, conversation switching, and close.
- `error`: keeps the modal open, shows the error, and allows retry.

The modal layout:

- Header with entry title and close button.
- Top segmented tabs: `历史续聊` and `新建对话`.
- In history mode, a horizontal conversation selector is shown above the message area.
- Message area shows the selected conversation's ordered messages.
- Bottom input sends to the selected conversation or creates a new one.

If no history exists, the modal opens in `新建对话`.

## Training Plan Flow

The top-level `AI 对话` button opens the modal for global training plan generation or adjustment. If no plan exists, sending the first message creates a plan. If a plan exists, sending adjusts that plan.

The date-level AI adjustment opens the same modal with `target_date`. Historical conversations are still entry-scoped to the plan, but messages sent from date-level context include that target date.

After success:

- Save user and assistant messages.
- Update or create the training plan.
- Refresh plan data.
- Close the modal.

## Nutrition Plan Flow

The nutrition plan AI button opens the modal. If no plan exists, the first message generates a plan. If a plan exists, messages adjust the current plan unless the user starts a new conversation and explicitly asks for a new plan.

After success:

- Save messages.
- Update or create the nutrition plan.
- Refresh nutrition plan and summary data.
- Close the modal.

## Food Record Flow

The food page uses one record form named `记录`. It no longer has an AI/manual mode toggle.

The user can manually fill:

- Meal type.
- Time.
- Food name.
- Description.
- Calories.
- Protein.
- Carbs.
- Fat.

An AI button opens the AI modal for recognition. The modal supports:

- Image upload.
- Text description.
- New conversation.
- History continuation.

During recognition, the modal shows loading animation. On success it closes, creates the recognized nutrition log, refreshes the record list, and opens the correction form for that created log so the user can verify or adjust the AI result. If the user does not call AI, they can still fill the same `记录` form manually and save it directly.

## Pose Advice Flow

Pose AI advice remains inline. Clicking `AI 建议` shows a loading animation inside the button or directly below the button. It does not open a modal. The button is disabled while the request is in flight.

## AI Provider Settings

The settings page should reflect single-config behavior:

- If no config exists, show one form to create it.
- If a config exists, automatically populate provider type, base URL, model name, and active flag.
- Do not show a separate config list with an `编辑` button.
- Do not populate `api_key`; keep it blank with placeholder text explaining that leaving it blank preserves the existing key.
- The submit button saves the existing config or creates it if missing.
- Deleting can remain as a secondary action if existing backend support is kept, but it should not dominate the page.

## Error Handling

The modal stays open on errors:

- Missing AI provider config.
- Invalid or inaccessible conversation.
- Conversation topic mismatch.
- Plan not found.
- AI provider failure.
- AI returned invalid structured data.
- Food recognition request has neither image nor text.

Show the backend error message where available. Keep user input intact for retry.

## Testing

Backend tests:

- Conversation list is filtered by current user.
- Conversation detail rejects another user's conversation.
- Topic and linked plan validation reject mismatches.
- Continued training conversation appends messages and updates the plan.
- Continued nutrition conversation appends messages and updates the plan.
- New training and nutrition conversations still create plans.
- Food recognition creates or updates a food record and stores messages.
- AI config remains user-isolated.

Frontend tests or focused checks:

- AI modal opens with history or new state correctly.
- New conversation send shows loading and closes on success.
- History conversation send includes `conversation_id`.
- Failed send keeps modal open and displays error.
- Food record page supports manual entry without AI.
- Food AI recognition shows loading and writes recognized data back.
- Pose advice shows inline loading animation.
- AI settings page populates existing non-key fields without requiring edit mode.

## Verification Plan

Run backend tests for AI coach, nutrition plans, AI configs, and any new conversation tests. Run frontend typecheck and build or the repository's existing frontend test command. Start the backend and frontend dev servers and provide their local URLs for manual testing.
