import { AttestationServiceConfig } from "../types";
import axios from "axios";

export async function getReviewAttestationsInfo(
  did: string,
  reviewAttestationSchemaId: string,
  attestationConfig?: AttestationServiceConfig
): Promise<{ averageStars: number; reviewCount: number }> {
  if (!attestationConfig?.apiUrl) {
    throw new Error("AttestationServiceConfig with apiUrl is required");
  }
  const reviews: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const pageSize = attestationConfig.pageSize || 20;

  const page1Res = await axios.get(
    `${attestationConfig.apiUrl}/attestations?recipientDid=${did}&schemaId=${reviewAttestationSchemaId}&page_number=1&page_size=${pageSize}`
  );

  reviews.push(...page1Res.data.data);
  const totalPages = page1Res.data.totalPages;

  if (totalPages > 1) {
    for (let page = 2; page <= totalPages; page++) {
      const pagedRes = await axios.get(
        `${attestationConfig.apiUrl}/attestations?recipientDid=${did}&schemaId=${reviewAttestationSchemaId}&page_number=${page}&page_size=${pageSize}`
      );
      reviews.push(...pagedRes.data.data);
    }
  }

  const reviewCount = reviews.length;

  const totalStars = reviews.reduce((acc: any, review: any) => {
    const decodedDataJson = JSON.parse(review.decodedDataJson);
    const starsField = decodedDataJson.find(
      (field: any) => field.value.name === "stars"
    );
    acc += Number(starsField.value.value);
    return acc;
  }, 0);
  const averageStars = reviewCount > 0 ? totalStars / reviewCount : 0;

  return { averageStars, reviewCount };
}
