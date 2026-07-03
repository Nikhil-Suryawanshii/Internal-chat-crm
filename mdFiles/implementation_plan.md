# Multi-Language Support Implementation Plan

This document outlines the plan to implement multi-language support in the `Internal-chat-crm` React app, synchronizing it with the user's default language stored in the Mokapen `adm_user` table.

## User Review Required

> [!IMPORTANT]
> Please review the steps below. We will need to make changes both in the React app (to handle translations) and in the Mokapen backend (to pass the user's language).

## Open Questions

> [!WARNING]
> 1. What is the exact column name in the `adm_user` table that stores the language? Is it `language`, `lang`, or `default_language`?
> 2. Does the Mokapen backend (PHP/Blade) already inject this language value, or will you need me to provide the PHP code to update the Blade template?

## Proposed Changes

### 1. Backend (Mokapen PHP/Blade)
We need to ensure the user's language is passed to the React app. Currently, `App.js` expects data from `window.MokapenChatUser`.
- We must update the Blade file that initializes the chat to include the user's language (e.g. 'en', 'de', 'es', etc):
```javascript
window.MokapenChatUser = {
    id: '...',
    name: '...',
    // ...
    language: 'en' // <-- This needs to come from the adm_user table
};
```

### 2. Frontend Dependencies (React App)
- **Install i18n libraries:** We will install `i18next` and `react-i18next` via npm. These are the industry standard for React localization.

### 3. Frontend Configuration & Setup

#### [NEW] `src/i18n.js`
- Create an initialization file for `i18next`.
- Add the provided JSON translation object containing the 10 supported languages (English, German, Spanish, French, Italian, Polish, Portuguese, Romanian, Russian, Slovenian).
- Configure a fallback language (English).

#### [MODIFY] `src/index.js`
- Import `src/i18n.js` to ensure the translation library initializes before the app renders.

#### [MODIFY] `src/App.js`
- Update the `useEffect` that reads `window.MokapenChatUser` to also extract the `language`.
- Update the `login` function call to store `language` in the user state.
- Use `i18n.changeLanguage(user.language)` to dynamically switch the React app's language based on what was passed from the backend.

### 4. Component Translation Implementation

#### [MODIFY] Various Components
We will use the `useTranslation` hook to replace hardcoded strings with translation keys in all relevant files, such as:
- `src/components/Chat/ChatWidget.jsx` (e.g., "Chats" -> `t('messages')`)
- `src/components/Chat/NewChatView.jsx` (e.g., "New Chat" -> `t('new_chat')`)
- `src/components/Chat/NewGroupView.jsx` (e.g., "Create Group" -> `t('create_group')`)
- `src/components/Chat/GroupInfoView.jsx` (e.g., "Group Info" -> `t('group_info')`)

## Verification Plan

### Automated Tests
- N/A for UI translations, unless there are specific rendering tests.

### Manual Verification
1. Log into Mokapen with a user set to English. Open the chat widget and verify titles are in English.
2. Change the user's language in the `adm_user` table (or Mokapen UI) to another supported language.
3. Refresh the page, click the chat icon, and verify the titles and placeholders immediately reflect the new language.
