/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreatePortalMobileHandoffRequest = {
    action: CreatePortalMobileHandoffRequest.action;
};
export namespace CreatePortalMobileHandoffRequest {
    export enum action {
        START_PACKING = 'START_PACKING',
        RECORD_SEAL = 'RECORD_SEAL',
        RECORD_ARRIVAL = 'RECORD_ARRIVAL',
        RECORD_UNBOXING = 'RECORD_UNBOXING',
        RECORD_RETURN_PACKING = 'RECORD_RETURN_PACKING',
        RECORD_RETURN_SEAL = 'RECORD_RETURN_SEAL',
        RECORD_RETURN_UNBOXING = 'RECORD_RETURN_UNBOXING',
    }
}

