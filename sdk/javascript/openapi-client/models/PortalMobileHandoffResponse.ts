/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PortalMobileHandoffResponse = {
    data: {
        object: any;
        schemaVersion: any;
        channel: any;
        transactionId: string;
        /**
         * Mint-time capture hint. Native re-evaluates the current Next Action after open and must ignore this field when it is stale.
         */
        action: string;
        issuedAt: string;
        /**
         * Hint lifetime. Opening after expiry still evaluates the current transaction state.
         */
        expiresAt: string;
        captureOnNativeOnly: any;
        /**
         * Opens the transaction on native. The URL does not authorize a capture beat.
         */
        universalLink: string;
        appLink: string;
        storeUrl: string;
    };
};

