/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PortalProtocol } from './PortalProtocol';
export type PortalTransaction = {
    id: string;
    object: any;
    schemaVersion: any;
    sellerId: string | null;
    buyerId: string | null;
    participantIds: Array<string>;
    status: string;
    title: string;
    category: string;
    description: string;
    priceMinor: number | null;
    currency: string | null;
    identifiers: Array<{
        label: string;
        value: string;
    }>;
    conditionNotes: string;
    terms: any | null;
    confirmedBy: Array<string>;
    handoffConfirmedBy: Array<string>;
    completedBy: Array<string>;
    passportId: string | null;
    passportDisplayId: string | null;
    source: any | null;
    protocol: PortalProtocol;
    lockedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

