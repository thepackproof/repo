/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Amount } from './Amount';
export type CreateConnectSessionRequest = {
    schemaVersion: any;
    platform: string;
    externalOrderId: string;
    externalSellerId: string;
    itemTitle: string;
    itemDescription?: string;
    amount: Amount;
    trackingNumber?: string;
    carrier?: string;
    declaredWeightGrams?: number;
    callbackUrl: string;
};

