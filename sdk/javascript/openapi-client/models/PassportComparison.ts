/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PassportComparison = {
    attribute: PassportComparison.attribute;
    expected: string | null;
    observed: string | null;
    result: PassportComparison.result;
    method: PassportComparison.method;
    footnote: any;
};
export namespace PassportComparison {
    export enum attribute {
        UPC = 'UPC',
        GTIN = 'GTIN',
        SKU = 'SKU',
        SERIAL = 'SERIAL',
        QUANTITY = 'QUANTITY',
        VARIANT = 'VARIANT',
        TRACKING = 'TRACKING',
        TITLE = 'TITLE',
    }
    export enum result {
        SAME = 'SAME',
        DIFFERENT = 'DIFFERENT',
        CONSISTENT_WITH_DECLARED = 'CONSISTENT_WITH_DECLARED',
        NOT_CONSISTENT_WITH_DECLARED = 'NOT_CONSISTENT_WITH_DECLARED',
        NOT_COMPARED = 'NOT_COMPARED',
    }
    export enum method {
        EXACT_NORMALIZED = 'EXACT_NORMALIZED',
        DECLARED_INTERPRETATION = 'DECLARED_INTERPRETATION',
        NOT_COMPARABLE = 'NOT_COMPARABLE',
    }
}

