/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Amount } from './Amount';
import type { ImageReference } from './ImageReference';
import type { ItemIdentifier } from './ItemIdentifier';
import type { ItemOption } from './ItemOption';
export type CommerceItemDescriptor = {
    title: string;
    description: string;
    category: string | null;
    brand: string | null;
    model: string | null;
    sku: string | null;
    gtin: string | null;
    upc: string | null;
    mpn: string | null;
    serialNumber: string | null;
    selectedOptions: Array<ItemOption>;
    identifiers: Array<ItemIdentifier>;
    quantity: number;
    amount: (Amount | null);
    imageReferences: Array<ImageReference>;
};

