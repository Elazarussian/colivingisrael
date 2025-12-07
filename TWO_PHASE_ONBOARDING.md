# Two-Phase Onboarding System - Implementation Summary

## Overview
Implemented a two-phase onboarding questionnaire system that shows new users two groups of questions sequentially:
1. **Personal Data Questions** (פרטי משתמש)
2. **Personality Questions** (שאלות אישיות)

## Key Features

### 1. Sequential Question Groups
- Users first answer all personal data questions
- After completing personal data, they automatically move to personality questions
- Smooth transition between groups with clear visual indicators

### 2. Progress Tracking
The onboarding modal header now displays:
- **Group Title**: Shows which group the user is currently answering
  - "פרטי משתמש" for personal data questions
  - "שאלות אישיות" for personality questions
- **Current Group Progress**: e.g., "3 / 5" (question 3 out of 5 in current group)
- **Total Progress**: e.g., "סה"כ: 8 / 12" (answered 8 out of 12 total questions)
- **Next Group Preview**: Shows a preview of the next group when in the first group
  - Example: "הבא: שאלות אישיות (7 שאלות)"

### 3. Navigation
- **Previous Button**: 
  - Disabled on the first question of the first group
  - When on the first question of group 2, goes back to the last question of group 1
- **Next Button**:
  - Moves through questions within a group
  - Automatically transitions to the next group when completing a group
  - Shows only when not on the last question of the last group
- **Submit Button**:
  - Shows only on the last question of the last group
  - Saves all answers from both groups

## Technical Implementation

### TypeScript Changes (`profile.component.ts`)

#### New Properties:
```typescript
onboardingPersonalDataQuestions: Question[] = []; // Personal data questions
currentQuestionGroup = 0; // 0 = personal data, 1 = personality
```

#### New Getters:
- `currentQuestionList`: Returns the active question array based on current group
- `currentGroupTitle`: Returns the title for the current group
- `nextGroupPreview`: Shows preview of next group (if applicable)
- `totalQuestionsCount`: Shows overall progress (e.g., "8 / 12")
- `isLastGroup`: Checks if we're in the last group

#### Modified Methods:
- `loadOnboardingQuestions()`: Now loads both question groups from their respective collections
- `prepareOnboardingAnswers()`: Initializes answers for both groups
- `submitOnboardingAnswers()`: Saves answers from both groups
- `nextQuestion()`: Handles group transitions
- `prevQuestion()`: Allows navigation back across groups

### HTML Changes (`profile.component.html`)

#### Enhanced Modal Header:
```html
<div class="modal-header">
  <div style="flex:1;">
    <h2>{{ currentGroupTitle }}</h2>
    <div style="font-size:0.9rem;color:#666;margin-top:0.25rem;">
      <span>{{ currentOnboardingProgress }}</span>
      <span style="margin:0 0.5rem;">•</span>
      <span>סה"כ: {{ totalQuestionsCount }}</span>
    </div>
    <div *ngIf="nextGroupPreview" style="font-size:0.85rem;color:#888;margin-top:0.25rem;font-style:italic;">
      {{ nextGroupPreview }}
    </div>
  </div>
</div>
```

#### Updated Navigation Buttons:
- Previous button disabled when at the very beginning
- Next button shows when not at the end
- Submit button shows only on the last question of the last group

## User Experience Flow

1. **New User Registration**: User creates an account
2. **Onboarding Triggered**: Modal appears automatically
3. **Phase 1 - Personal Data**:
   - Title: "פרטי משתמש"
   - Progress: "1 / 5" (example)
   - Total: "סה"כ: 1 / 12"
   - Preview: "הבא: שאלות אישיות (7 שאלות)"
4. **Transition**: After answering the last personal data question, clicking "הבא" moves to personality questions
5. **Phase 2 - Personality**:
   - Title: "שאלות אישיות"
   - Progress: "1 / 7" (example)
   - Total: "סה"כ: 6 / 12"
   - No preview (last group)
6. **Completion**: After the last question, "סיים ושלח" button saves all answers

## Data Storage
All answers from both groups are saved together in the user's profile document under the `questions` field, with question IDs as keys.

## Collections Used
- `userPersonalDataQuestions`: Personal data questions
- `newUsersQuestions`: Personality/registration questions
