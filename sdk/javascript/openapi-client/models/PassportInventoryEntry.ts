/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PassportInventoryEntry = {
    category: PassportInventoryEntry.category;
    state: PassportInventoryEntry.state;
    artifactIds: Array<string>;
};
export namespace PassportInventoryEntry {
    export enum category {
        COMMERCE_ORDER_RECORD = 'COMMERCE_ORDER_RECORD',
        ITEM_IDENTIFIER_EVIDENCE = 'ITEM_IDENTIFIER_EVIDENCE',
        CONDITION_EVIDENCE = 'CONDITION_EVIDENCE',
        PACKING_CAPTURE = 'PACKING_CAPTURE',
        PACKAGE_SEALING = 'PACKAGE_SEALING',
        SHIPPING_LABEL_EVIDENCE = 'SHIPPING_LABEL_EVIDENCE',
        TRACKING_ASSOCIATION = 'TRACKING_ASSOCIATION',
        WEIGHT_OBSERVATION = 'WEIGHT_OBSERVATION',
        CARRIER_ACCEPTANCE = 'CARRIER_ACCEPTANCE',
        DELIVERY_EVIDENCE = 'DELIVERY_EVIDENCE',
        RECEIVER_CAPTURE = 'RECEIVER_CAPTURE',
        RETURN_EVIDENCE = 'RETURN_EVIDENCE',
        REFUND_EVIDENCE = 'REFUND_EVIDENCE',
    }
    export enum state {
        AVAILABLE = 'AVAILABLE',
        NOT_AVAILABLE = 'NOT_AVAILABLE',
        NOT_APPLICABLE = 'NOT_APPLICABLE',
        REVIEW_REQUIRED = 'REVIEW_REQUIRED',
    }
}

