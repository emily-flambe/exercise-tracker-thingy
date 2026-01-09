# PR Detection Test Cases

This document describes the expected behavior of PR (Personal Record) detection and how to manually verify it works correctly.

## Expected Behavior

A set should be marked with a PR star (⭐) if and only if:
- The reps at that weight **exceed** (not equal) any previous best
- "Previous best" includes both:
  - The best from any prior workout at that weight
  - The best from earlier sets in the current workout at that weight

## Test Cases

### Test 1: First Set at Weight is PR
**Setup:** No previous workouts
**Action:** Do 100 lbs × 10 reps
**Expected:** Set gets PR star ⭐

### Test 2: Second Set with More Reps Also Gets PR
**Setup:** Same workout as Test 1
**Action:** Do another set: 100 lbs × 12 reps
**Expected:**
- Set 1 (10 reps): PR star ⭐
- Set 2 (12 reps): PR star ⭐ (beats the 10 from Set 1)

### Test 3: Second Set with Same Reps Does NOT Get PR
**Setup:** No previous workouts
**Action:**
- Set 1: 100 lbs × 10 reps
- Set 2: 100 lbs × 10 reps (same reps)
**Expected:**
- Set 1: PR star ⭐
- Set 2: NO star (10 is not greater than 10)

### Test 4: Second Set with Fewer Reps Does NOT Get PR
**Setup:** No previous workouts
**Action:**
- Set 1: 100 lbs × 12 reps
- Set 2: 100 lbs × 10 reps (fewer reps)
**Expected:**
- Set 1: PR star ⭐
- Set 2: NO star (10 < 12)

### Test 5: Progressive PRs in Same Workout
**Setup:** No previous workouts
**Action:** Four sets at 100 lbs
- Set 1: 10 reps
- Set 2: 11 reps
- Set 3: 12 reps
- Set 4: 11 reps
**Expected:**
- Set 1: PR star ⭐ (first time)
- Set 2: PR star ⭐ (beats 10)
- Set 3: PR star ⭐ (beats 11)
- Set 4: NO star (11 < 12)

### Test 6: Beats Previous Workout, Then Beats Self
**Setup:** Previous workout had 100 lbs × 8 reps
**Action:** Current workout
- Set 1: 100 lbs × 9 reps
- Set 2: 100 lbs × 10 reps
**Expected:**
- Set 1: PR star ⭐ (beats previous 8)
- Set 2: PR star ⭐ (beats current workout's 9)

### Test 7: Different Exercises Track Independently
**Setup:** No previous workouts
**Action:**
- Exercise 1 (Bench Press): 100 lbs × 10 reps, then 100 lbs × 10 reps
- Exercise 2 (Squat): 100 lbs × 10 reps, then 100 lbs × 10 reps
**Expected:**
- Bench Press Set 1: PR star ⭐
- Bench Press Set 2: NO star
- Squat Set 1: PR star ⭐ (first time for Squat)
- Squat Set 2: NO star

## How to Manually Test

1. Clear all data (use "Clear All Data" button in app)
2. Start a new workout
3. Add an exercise (e.g., Bench Press)
4. Follow the test cases above
5. After finishing the workout, view it to see which sets have the PR star

## Implementation Details

The PR detection logic is in `src/db/queries.ts:407-472` in the `detectAndRecordPRs()` function.

Key logic (line 455):
```typescript
const isPR = maxToBeat === null || set.reps > maxToBeat;
```

This uses strict greater-than (`>`), not greater-or-equal (`>=`), ensuring that:
- If reps equal the previous best, it's NOT a PR
- Only when reps exceed the previous best is it a PR

The function tracks within-workout bests using a Map:
```typescript
const currentWorkoutBests = new Map<string, Map<number, number>>();
```
This ensures that each subsequent set is compared against both:
1. The best from previous workouts (from database)
2. The best from earlier sets in the current workout (from the Map)
