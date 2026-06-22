export interface SatisfactionMetrics {
  averageRating: number;
  csatScore: number;
  responseCount: number;
  satisfiedCount: number;
}

export type NpsCategory = 'detractor' | 'passive' | 'promoter';

export interface NpsMetrics {
  npsScore: number;
  promoters: number;
  passives: number;
  detractors: number;
  responseCount: number;
}

export const classifyNpsScore = (score: unknown): NpsCategory | null => {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 10) return null;
  if (value >= 9) return 'promoter';
  if (value >= 7) return 'passive';
  return 'detractor';
};

/** Globally recognized NPS: promoters 9-10, passives 7-8, detractors 0-6; score is -100 to +100. */
export function calculateNps(
  responses: Array<{ recommendation_score?: unknown }> = [],
): NpsMetrics {
  const categories = responses
    .map((response) => classifyNpsScore(response.recommendation_score))
    .filter((category): category is NpsCategory => category !== null);

  if (categories.length === 0) {
    return { npsScore: 0, promoters: 0, passives: 0, detractors: 0, responseCount: 0 };
  }

  const promoters = categories.filter((category) => category === 'promoter').length;
  const passives = categories.filter((category) => category === 'passive').length;
  const detractors = categories.filter((category) => category === 'detractor').length;

  return {
    npsScore: Math.round(((promoters - detractors) / categories.length) * 100),
    promoters,
    passives,
    detractors,
    responseCount: categories.length,
  };
}

/** Conventional top-two-box CSAT: ratings 4-5 divided by valid ratings 1-5. */
export function calculateSatisfaction(
  responses: Array<{ overall_satisfaction?: unknown }> = [],
): SatisfactionMetrics {
  const ratings = responses
    .map((response) => Number(response.overall_satisfaction))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

  if (ratings.length === 0) {
    return { averageRating: 0, csatScore: 0, responseCount: 0, satisfiedCount: 0 };
  }

  const satisfiedCount = ratings.filter((rating) => rating >= 4).length;
  return {
    averageRating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
    csatScore: Math.round((satisfiedCount / ratings.length) * 100),
    responseCount: ratings.length,
    satisfiedCount,
  };
}
