/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ConnectManifestAuthentication = {
    type: ConnectManifestAuthentication.type;
    algorithm?: any;
    keyId?: string;
    macBase64url: string | null;
    verificationScope: any;
};
export namespace ConnectManifestAuthentication {
    export enum type {
        SERVICE_MAC = 'SERVICE_MAC',
        LEGACY_SERVICE_MAC = 'LEGACY_SERVICE_MAC',
    }
}

