class FeedbackValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FeedbackValidationError';
    this.code = 'FEEDBACK_VALIDATION_FAILED';
    this.status = 400;
  }
}

const LEGACY_RATING_COLUMNS = Object.freeze({
  q1: 'installation_quality_rating',
  q2: 'installation_timeliness_rating',
  q3: 'installation_communication_rating',
  q4: 'technician_knowledge_rating',
});

const INSTALLATION_FEEDBACK_INSERT_SQL = `INSERT INTO installation_feedback (
  id, client_id, installation_id,
  installation_quality_rating, installation_timeliness_rating, installation_communication_rating,
  technician_knowledge_rating, technician_professionalism_rating, technician_helpfulness_rating,
  overall_satisfaction, recommendation_score,
  positive_feedback, improvement_suggestions, dynamic_responses, feedback_date
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`;

const requireIntegerScore = (value, minimum, maximum, label) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new FeedbackValidationError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
};

const prepareInstallationFeedback = ({ dynamicResponses, questions, overallSatisfaction, recommendationScore }) => {
  if (!dynamicResponses || typeof dynamicResponses !== 'object' || Array.isArray(dynamicResponses)) {
    throw new FeedbackValidationError('Feedback responses must be supplied as an object.');
  }

  const activeQuestions = (Array.isArray(questions) ? questions : [])
    .filter((question) => Boolean(question.is_active))
    .sort((left, right) => Number(left.order_index || 0) - Number(right.order_index || 0));
  const questionsById = new Map(activeQuestions.map((question) => [String(question.id), question]));

  for (const responseId of Object.keys(dynamicResponses)) {
    if (!questionsById.has(responseId)) {
      throw new FeedbackValidationError('Feedback contains an inactive or unknown question.');
    }
  }

  const normalizedResponses = {};
  const textResponses = [];
  for (const question of activeQuestions) {
    const id = String(question.id);
    const value = dynamicResponses[id];
    if (question.question_type === 'rating') {
      normalizedResponses[id] = requireIntegerScore(value, 1, 5, 'Rating');
    } else if (question.question_type === 'nps') {
      normalizedResponses[id] = requireIntegerScore(value, 0, 10, 'Recommendation score');
    } else if (question.question_type === 'text') {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        throw new FeedbackValidationError('Text feedback must be text.');
      }
      normalizedResponses[id] = typeof value === 'string' ? value : '';
      const trimmed = normalizedResponses[id].trim();
      if (trimmed) textResponses.push(trimmed);
    } else {
      throw new FeedbackValidationError('Feedback contains an unsupported question type.');
    }
  }

  const legacyRatings = {
    installation_quality_rating: null,
    installation_timeliness_rating: null,
    installation_communication_rating: null,
    technician_knowledge_rating: null,
    technician_professionalism_rating: null,
    technician_helpfulness_rating: null,
  };
  for (const [questionId, column] of Object.entries(LEGACY_RATING_COLUMNS)) {
    const question = questionsById.get(questionId);
    if (question?.question_type === 'rating') legacyRatings[column] = normalizedResponses[questionId];
  }

  const resolvedOverallSatisfaction = questionsById.get('q1')?.question_type === 'rating'
    ? normalizedResponses.q1
    : requireIntegerScore(overallSatisfaction, 1, 5, 'Overall satisfaction');
  const resolvedRecommendationScore = questionsById.get('q5')?.question_type === 'nps'
    ? normalizedResponses.q5
    : requireIntegerScore(recommendationScore, 0, 10, 'Recommendation score');

  return {
    dynamicResponses: normalizedResponses,
    legacyRatings,
    overallSatisfaction: resolvedOverallSatisfaction,
    recommendationScore: resolvedRecommendationScore,
    positiveFeedback: textResponses[0] || '',
    improvementSuggestions: textResponses.slice(1).join('\n\n'),
  };
};

const buildInstallationFeedbackInsert = ({ id, clientId, installationId, preparedFeedback }) => ({
  sql: INSTALLATION_FEEDBACK_INSERT_SQL,
  values: [
    id,
    clientId,
    installationId,
    preparedFeedback.legacyRatings.installation_quality_rating,
    preparedFeedback.legacyRatings.installation_timeliness_rating,
    preparedFeedback.legacyRatings.installation_communication_rating,
    preparedFeedback.legacyRatings.technician_knowledge_rating,
    preparedFeedback.legacyRatings.technician_professionalism_rating,
    preparedFeedback.legacyRatings.technician_helpfulness_rating,
    preparedFeedback.overallSatisfaction,
    preparedFeedback.recommendationScore,
    preparedFeedback.positiveFeedback,
    preparedFeedback.improvementSuggestions,
    JSON.stringify(preparedFeedback.dynamicResponses),
  ],
});

module.exports = {
  buildInstallationFeedbackInsert,
  FeedbackValidationError,
  INSTALLATION_FEEDBACK_INSERT_SQL,
  LEGACY_RATING_COLUMNS,
  prepareInstallationFeedback,
};
