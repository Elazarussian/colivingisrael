# User Personal Data Questions Feature

## Overview
Added a new type of questions system for collecting user personal data, separate from the registration questions. This allows administrators to manage a different set of questions for user profiles.

## Changes Made

### 1. TypeScript Component (`profile.component.ts`)
- Added new properties for managing personal data questions:
  - `showPersonalDataQuestionsModal`: Controls modal visibility
  - `personalDataQuestions`: Array of personal data questions
  - `newPersonalDataQuestion`: Form data for creating new questions
  - `newPersonalDataOption`: Temporary storage for adding options

- Added new methods:
  - `openPersonalDataQuestions()`: Opens the personal data questions modal
  - `closePersonalDataQuestionsModal()`: Closes the modal
  - `loadPersonalDataQuestions()`: Loads questions from Firestore
  - `addPersonalDataQuestion()`: Creates a new personal data question
  - `deletePersonalDataQuestion(id)`: Deletes a personal data question
  - `addPersonalDataOption()`: Adds an option to checklist/radio questions
  - `removePersonalDataOption(index)`: Removes an option from the list

### 2. HTML Template (`profile.component.html`)
- Added a new button in the admin panel: "נהל שאלון פרטי משתמש"
- Created a complete modal for managing personal data questions with:
  - List of existing questions
  - Form to add new questions
  - Support for all question types (text, yesno, checklist, date, scale, range, radio)
  - Delete functionality for each question

### 3. Firestore Security Rules (`firestore.rules`)
- Added security rules for the new `userPersonalDataQuestions` collection:
  - Read access: Everyone (needed for displaying questions)
  - Write access: Admins only (create, update, delete)

## Firestore Collections

### `userPersonalDataQuestions`
This new collection stores personal data questions with the following structure:
```javascript
{
  text: string,          // Question text
  type: string,          // Question type: 'text', 'yesno', 'checklist', 'date', 'scale', 'range', 'radio'
  options: string[],     // Options for 'checklist' and 'radio' types
  min: number,           // Minimum value for 'scale' and 'range' types
  max: number,           // Maximum value for 'scale' and 'range' types
  createdAt: string      // ISO timestamp
}
```

## Usage

### For Administrators:
1. Navigate to `/profile` page
2. Click on "נהל שאלון פרטי משתמש" button
3. View existing personal data questions
4. Add new questions by:
   - Entering question text
   - Selecting question type
   - Adding options (for checklist/radio) or setting min/max (for scale/range)
   - Clicking "הוסף שאלה"
5. Delete questions by clicking the "מחק" button

### Question Types Supported:
- **טקסט חופשי** (text): Free text input
- **כן/לא** (yesno): Yes/No buttons
- **רשימת אפשרויות** (checklist): Multiple choice checkboxes
- **תאריך** (date): Date picker
- **דירוג** (scale): Slider with min/max range
- **טווח מספרים** (range): Two number inputs for a range
- **בחירה יחידה** (radio): Single choice radio buttons

## Next Steps (Future Enhancement)
To fully integrate this feature, you may want to:
1. Create a UI for users to answer these personal data questions
2. Store user answers in the `profiles` collection (similar to registration questions)
3. Add a view for admins to see user answers to personal data questions
4. Implement validation and required fields logic
