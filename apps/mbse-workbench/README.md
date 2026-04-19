<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/abc26de7-d5c2-4b21-8bfb-e4c538fb23ef

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure one of the supported AI providers in `.env.local`:
   - Gemini: `GEMINI_API_KEY`
   - DeepSeek: `DEEPSEEK_API_KEY`
   - Qwen: `QWEN_API_KEY`
   - Any OpenAI-compatible endpoint: `OPENAI_API_KEY`, optionally `AI_BASE_URL` and `AI_MODEL`
3. Or paste the key, model, and endpoint directly in the in-app AI settings panel
4. Run the app:
   `npm run dev`
