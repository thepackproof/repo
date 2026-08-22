/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PortalProofAvailability = {
    availability: PortalProofAvailability.availability;
    passportId: string | null;
    displayId: string | null;
};
export namespace PortalProofAvailability {
    export enum availability {
        NOT_ELIGIBLE = 'NOT_ELIGIBLE',
        ELIGIBLE_NOT_ISSUED = 'ELIGIBLE_NOT_ISSUED',
        AVAILABLE = 'AVAILABLE',
    }
}

