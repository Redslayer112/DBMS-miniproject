import { q } from './db';

// Deterministic, explainable NGO matching (same query as sql/queries.sql Q22).
// Eligibility: donation AVAILABLE & unexpired, NGO available, accepts the category,
// remaining capacity >= quantity. Score /100 = category 30 + capacity fit 25
// + expiry urgency 25 + proximity 20 (Haversine). Nothing is stored.
const SQL = `
WITH c AS (
  SELECT ad.donation_id, ad.food_name, ad.category_name, ad.business_name, ad.quantity_kg,
         ad.expires_at, TIMESTAMPDIFF(MINUTE, NOW(), ad.expires_at) / 60 AS hours_left,
         n.ngo_id, n.organization_name, cap.remaining_kg,
         fn_haversine_km(ad.latitude, ad.longitude, nl.latitude, nl.longitude) AS distance_km
    FROM available_donations ad
    JOIN ngo_food_categories nfc ON nfc.category_id = ad.category_id
    JOIN ngos n                  ON n.ngo_id = nfc.ngo_id AND n.is_available
    JOIN locations nl            ON nl.location_id = n.location_id
    JOIN ngo_active_capacity cap ON cap.ngo_id = n.ngo_id
   WHERE cap.remaining_kg >= ad.quantity_kg
), s AS (
  SELECT c.*, 30 AS category_score,
         ROUND(25 * LEAST(1, remaining_kg / (2 * quantity_kg)), 1) AS capacity_score,
         ROUND(25 * GREATEST(0, 1 - hours_left / 48), 1) AS urgency_score,
         ROUND(20 * GREATEST(0, 1 - distance_km / 50), 1) AS proximity_score
    FROM c
)
SELECT s.*, ROUND(category_score + capacity_score + urgency_score + proximity_score, 1) AS total_score
  FROM s
 WHERE (? IS NULL OR donation_id = ?) AND (? IS NULL OR ngo_id = ?)
 ORDER BY total_score DESC, distance_km ASC, remaining_kg DESC, ngo_id ASC`;

export type Match = {
  donation_id: number; food_name: string; category_name: string; business_name: string;
  quantity_kg: number; expires_at: string; ngo_id: number; organization_name: string;
  remaining_kg: number; distance_km: number; category_score: number; capacity_score: number;
  urgency_score: number; proximity_score: number; total_score: number;
};

export function matches({ donationId = null, ngoId = null }: { donationId?: number | null; ngoId?: number | null }) {
  return q<Match>(SQL, [donationId, donationId, ngoId, ngoId]);
}
