/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssuranceDimension } from './AssuranceDimension';
/**
 * Layered observation metadata. physicalCorrespondence is always NOT_AVAILABLE and businessLegalRelevance is always REVIEW_REQUIRED in this release. These dimensions are not a MATCH/NON_MATCH verdict.
 */
export type AssuranceAssessment = {
    acquisitionQuality: AssuranceDimension;
    appDeviceContext: AssuranceDimension;
    byteIntegrity: AssuranceDimension;
    physicalCorrespondence: AssuranceDimension;
    carrierContext: AssuranceDimension;
    businessLegalRelevance: AssuranceDimension;
};

