/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Amount } from './Amount';
export type ConnectSession = {
    id: string;
    object: any;
    schemaVersion: any;
    platform: string;
    externalOrderId: string;
    status: string;
    transactionId: string | null;
    commerceContextId: string | null;
    itemTitle: string;
    amount: Amount;
    trackingNumber: string | null;
    carrier: string | null;
    expiresAt: string;
    createdAt: string;
};

