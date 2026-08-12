/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PublicCommerceSource = {
    platform: PublicCommerceSource.platform;
    /**
     * HTTPS URL whose origin must exactly match the calling Origin header.
     */
    productUrl: string;
    externalProductId: string | null;
    externalListingId: string | null;
    externalVariantId: string | null;
};
export namespace PublicCommerceSource {
    export enum platform {
        SHOPIFY = 'SHOPIFY',
        WOOCOMMERCE = 'WOOCOMMERCE',
        MAGENTO = 'MAGENTO',
        CUSTOM = 'CUSTOM',
        MARKETPLACE = 'MARKETPLACE',
        STRUCTURED_PAGE_DATA = 'STRUCTURED_PAGE_DATA',
    }
}

