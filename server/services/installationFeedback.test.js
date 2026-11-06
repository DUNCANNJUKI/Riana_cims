const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInstallationFeedbackInsert, prepareInstallationFeedback } = require('./installationFeedback');

const questions = [
  { id: 'q1', question_type: 'rating', is_active: 1, order_index: 1 },
  { id: 'q2', question_type: 'rating', is_active: 1, order_index: 2 },
  { id: 'q3', question_type: 'rating', is_active: 1, order_index: 3 },
  { id: 'q4', question_type: 'rating', is_active: 1, order_index: 4 },
  { id: 'q5', question_type: 'nps', is_active: 1, order_index: 5 },
  { id: 'q6', question_type: 'text', is_active: 1, order_index: 6 },
  { id: 'custom-text', question_type: 'text', is_active: 1, order_index: 7 },
];

const validResponses = {
  q1: 4,
  q2: 3,
  q3: 5,
  q4: 2,
  q5: 0,
  q6: 'Positive comment',
  'custom-text': 'Improvement suggestion',
};

test('maps verified stable rating IDs and preserves dynamic and text responses', () => {
  const result = prepareInstallationFeedback({
    dynamicResponses: validResponses,
    questions,
    overallSatisfaction: 5,
    recommendationScore: 10,
  });

  assert.deepEqual(result.legacyRatings, {
    installation_quality_rating: 4,
    installation_timeliness_rating: 3,
    installation_communication_rating: 5,
    technician_knowledge_rating: 2,
    technician_professionalism_rating: null,
    technician_helpfulness_rating: null,
  });
  assert.equal(result.overallSatisfaction, 4);
  assert.equal(result.recommendationScore, 0);
  assert.deepEqual(result.dynamicResponses, validResponses);
  assert.equal(result.positiveFeedback, 'Positive comment');
  assert.equal(result.improvementSuggestions, 'Improvement suggestion');
});

test('builds a parameterized INSERT with exact submitted values in column order', () => {
  const preparedFeedback = prepareInstallationFeedback({
    dynamicResponses: validResponses,
    questions,
  });
  const insert = buildInstallationFeedbackInsert({
    id: 'feedback-id',
    clientId: 'client-id',
    installationId: 'installation-id',
    preparedFeedback,
  });

  assert.equal((insert.sql.match(/\?/g) || []).length, insert.values.length);
  assert.deepEqual(insert.values.slice(0, 13), [
    'feedback-id',
    'client-id',
    'installation-id',
    4,
    3,
    5,
    2,
    null,
    null,
    4,
    0,
    'Positive comment',
    'Improvement suggestion',
  ]);
  assert.deepEqual(JSON.parse(insert.values[13]), validResponses);
});

test('preserves optional text questions when absent', () => {
  const ratingQuestions = questions.filter((question) => question.question_type !== 'text');
  const ratingResponses = Object.fromEntries(
    Object.entries(validResponses).filter(([id]) => id !== 'q6' && id !== 'custom-text'),
  );
  const result = prepareInstallationFeedback({
    dynamicResponses: ratingResponses,
    questions: ratingQuestions,
  });
  assert.equal(result.positiveFeedback, '');
  assert.equal(result.improvementSuggestions, '');
});

for (const [name, responses] of [
  ['missing required rating', { ...validResponses, q1: undefined }],
  ['non-numeric rating', { ...validResponses, q2: '3' }],
  ['out-of-range rating', { ...validResponses, q3: 6 }],
  ['out-of-range recommendation score', { ...validResponses, q5: 11 }],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => prepareInstallationFeedback({ dynamicResponses: responses, questions }),
      (error) => error.code === 'FEEDBACK_VALIDATION_FAILED' && error.status === 400,
    );
  });
}

test('rejects responses for inactive or unknown questions', () => {
  assert.throws(
    () => prepareInstallationFeedback({
      dynamicResponses: { ...validResponses, unexpected: 5 },
      questions,
    }),
    (error) => error.code === 'FEEDBACK_VALIDATION_FAILED',
  );
});

test('does not map a stable ID when its configured type is no longer a rating', () => {
  const changedQuestions = questions.map((question) => (
    question.id === 'q4' ? { ...question, question_type: 'text' } : question
  ));
  const result = prepareInstallationFeedback({
    dynamicResponses: { ...validResponses, q4: 'Technician comment' },
    questions: changedQuestions,
  });
  assert.equal(result.legacyRatings.technician_knowledge_rating, null);
  assert.equal(result.positiveFeedback, 'Technician comment');
});
