import type { EvidenceType } from '@/types/models';

export type CaptureGuide = { title: string; instruction: string; aspectRatio: number };

export const videoTypes = new Set<EvidenceType>(['PACKING_VIDEO', 'UNBOXING_VIDEO', 'RETURN_PACKING_VIDEO', 'RETURN_UNBOXING_VIDEO']);
export const labelAwareTypes = new Set<EvidenceType>(['PACKING_VIDEO', 'SHIPPING_LABEL', 'RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL']);

const defaultPhotoGuide: CaptureGuide = {
  title: 'Evidence framing guide',
  instruction: 'Keep the complete relevant subject inside the guide with surrounding context visible.',
  aspectRatio: 3 / 4,
};

const defaultVideoGuide: CaptureGuide = {
  title: 'Continuous action area',
  instruction: 'Keep the package, item, hands, and relevant action visible throughout the recording.',
  aspectRatio: 3 / 4,
};

const captureGuides: Partial<Record<EvidenceType, CaptureGuide>> = {
  ITEM_PHOTO: { title: 'Complete item', instruction: 'Show the entire item without cropping its edges.', aspectRatio: 3 / 4 },
  CONDITION_PHOTO: { title: 'Condition and context', instruction: 'Center the condition area while retaining enough surrounding detail to locate it.', aspectRatio: 1 },
  IDENTIFIER_PHOTO: { title: 'Identifier and context', instruction: 'Keep the identifier readable and include the nearby item surface.', aspectRatio: 4 / 3 },
  COA_PHOTO: { title: 'Complete document', instruction: 'Align all document edges inside the guide and avoid glare.', aspectRatio: 3 / 4 },
  SHIPPING_LABEL: { title: 'PP mark and seal reference', instruction: 'Fill the frame with the PP mark crossing the label and package, plus tape or seal and nearby cardboard.', aspectRatio: 4 / 3 },
  DELIVERY_PHOTO: { title: 'Received package before opening', instruction: 'Show the received package, label/package boundary, visible seams, and tape or seal before any opening.', aspectRatio: 3 / 4 },
  SUPPORTING_DOCUMENT: { title: 'Complete document', instruction: 'Align all document edges inside the guide and keep text legible.', aspectRatio: 3 / 4 },
  RETURN_CONDITION_PHOTO: { title: 'Return condition and context', instruction: 'Center the condition area while retaining identifying context.', aspectRatio: 1 },
  RETURN_SHIPPING_LABEL: { title: 'Return PP mark and seal reference', instruction: 'Fill the frame with the return PP mark crossing the label and package, plus tape or seal and nearby cardboard.', aspectRatio: 4 / 3 },
};

const videoGuides: Partial<Record<EvidenceType, CaptureGuide>> = {
  PACKING_VIDEO: { title: 'Item-to-seal sequence', instruction: 'Keep the item, package, PP mark, and tape in frame. End on a steady view of the marked label/package boundary.', aspectRatio: 3 / 4 },
  UNBOXING_VIDEO: { title: 'Arrival-to-contents sequence', instruction: 'Start with the sealed package, boundary mark, tape, and seams. Keep the opening continuous before setting contents aside.', aspectRatio: 3 / 4 },
  RETURN_PACKING_VIDEO: { title: 'Return item-to-seal sequence', instruction: 'Keep the returned item, package, PP mark, and tape in frame. End on a steady view of the marked boundary.', aspectRatio: 3 / 4 },
  RETURN_UNBOXING_VIDEO: { title: 'Return arrival-to-contents sequence', instruction: 'Start with the sealed return package, boundary mark, tape, and seams. Keep the opening continuous.', aspectRatio: 3 / 4 },
};

export const captureTitles: Record<EvidenceType, string> = {
  ITEM_PHOTO: 'Item photo',
  CONDITION_PHOTO: 'Condition photo',
  IDENTIFIER_PHOTO: 'Identifier photo',
  COA_PHOTO: 'COA photo',
  PACKING_VIDEO: 'Continuous packing video',
  SHIPPING_LABEL: 'High-resolution seal reference',
  UNBOXING_VIDEO: 'Continuous unboxing video',
  DELIVERY_PHOTO: 'Arrival package observation',
  SUPPORTING_DOCUMENT: 'Supporting document',
  RETURN_CONDITION_PHOTO: 'Return condition photo',
  RETURN_PACKING_VIDEO: 'Continuous return repacking video',
  RETURN_SHIPPING_LABEL: 'High-resolution return seal reference',
  RETURN_UNBOXING_VIDEO: 'Continuous returned-item unboxing video',
  PHYSICAL_REFERENCE_FRAME: 'Physical reference frame',
  PHYSICAL_VERIFICATION_FRAME: 'Physical verification frame',
};

export const captureChecklists: Partial<Record<EvidenceType, string[]>> = {
  PACKING_VIDEO: [
    'Begin with the unpacked item and included accessories visible in one continuous take.',
    'Place the item into the package on camera, then close the package.',
    'Apply a shipping label so the label and adjacent package surface remain visible. A printed or sample label is enough — paid postage is not required. Scanning the tracking barcode is optional.',
    'Draw the designated PP mark across the label/package boundary so it spans both surfaces.',
    'Apply the prescribed clear tape or seal over the mark and seams.',
    'Finish with a steady, high-resolution view of the marked boundary, tape, and nearby cardboard.',
  ],
  UNBOXING_VIDEO: [
    'Before opening, record every side of the received package, including the label/package boundary, seams, and tape or seal.',
    'Do not dispose of or alter the packaging before those regions are recorded.',
    'Keep the package and contents in frame continuously while opening.',
    'Show packing materials, included items, and identifiers. PackProof does not decide cause, actor, or fault.',
  ],
  RETURN_PACKING_VIDEO: [
    'Begin with the returned item, accessories, and identifiers visible in one continuous take.',
    'Document the current visible condition before packing.',
    'Keep the item in frame while adding every packing layer and sealing the package.',
    'Apply a return shipping label so the label and adjacent package remain visible. A printed or sample label is enough — paid postage is not required. Scanning the tracking barcode is optional.',
    'Draw the PP mark across the return label/package boundary, apply tape or seal, and finish on a steady view of that boundary.',
  ],
  RETURN_UNBOXING_VIDEO: [
    'Begin with all sides of the sealed return package, including the boundary mark, tape or seal, and seams.',
    'Open continuously without moving the package or contents off camera.',
    'Show identifiers, accessories, packing materials, and visible condition before ending.',
    'PackProof preserves the observations. It does not decide cause, actor, authenticity, or fault.',
  ],
  SHIPPING_LABEL: [
    'Fill the frame with the PP mark crossing the label and the package.',
    'Include the tape or seal, nearby seams, and adjacent cardboard.',
    'Keep the tracking barcode readable when it is present.',
    'Hold the camera steady. This still is a high-resolution reference for later human review, not a system verdict.',
  ],
  DELIVERY_PHOTO: [
    'Photograph the received package before opening or discarding packaging.',
    'Include the label/package boundary, any visible PP mark, tape or seal, and seams.',
    'Keep surrounding context limited to what is needed to locate those regions.',
    'This arrival still is for human comparison with the seller reference. PackProof does not conclude whether the package matches.',
  ],
  RETURN_SHIPPING_LABEL: [
    'Fill the frame with the return PP mark crossing the label and the package.',
    'Include the tape or seal, nearby seams, and adjacent cardboard.',
    'Keep the return tracking barcode readable when it is present.',
    'Hold the camera steady. This still is a high-resolution reference for later human review, not a system verdict.',
  ],
  ITEM_PHOTO: ['Fill the frame with the complete item.', 'Use even lighting and avoid filters.', 'Capture identifiers separately when they are too small to read.'],
  CONDITION_PHOTO: ['Focus on the exact condition area.', 'Include enough surrounding detail to establish where it is.', 'Do not use beauty filters or image editing.'],
  RETURN_CONDITION_PHOTO: ['Show the complete returned item first.', 'Capture the exact condition issue and surrounding context.', 'Include identifiers when possible.'],
};

export const requestedRegions: Record<EvidenceType, string[]> = {
  ITEM_PHOTO: ['ITEM_OVERVIEW'],
  CONDITION_PHOTO: ['ITEM_OVERVIEW', 'CONDITION_DETAIL'],
  IDENTIFIER_PHOTO: ['IDENTIFIER', 'SURROUNDING_CONTEXT'],
  COA_PHOTO: ['DOCUMENT_OVERVIEW', 'IDENTIFIER'],
  PACKING_VIDEO: ['ITEM_OVERVIEW', 'IDENTIFIER', 'PACKAGE_INTERIOR', 'PACKING_SEQUENCE', 'SEALED_PACKAGE', 'LABEL_PACKAGE_BOUNDARY', 'PP_BOUNDARY_MARK', 'TAPE_OR_SEAL', 'HIGH_RESOLUTION_REFERENCE', 'TRACKING_LABEL'],
  SHIPPING_LABEL: ['TRACKING_LABEL', 'LABEL_PACKAGE_BOUNDARY', 'PP_BOUNDARY_MARK', 'TAPE_OR_SEAL', 'ADJACENT_PACKAGE_SURFACE'],
  UNBOXING_VIDEO: ['SEALED_PACKAGE', 'LABEL_PACKAGE_BOUNDARY', 'PP_BOUNDARY_MARK', 'TAPE_OR_SEAL', 'OPENING_SEQUENCE', 'CONTENTS_OVERVIEW', 'IDENTIFIER', 'CONDITION_DETAIL'],
  DELIVERY_PHOTO: ['PACKAGE_OVERVIEW', 'LABEL_PACKAGE_BOUNDARY', 'PP_BOUNDARY_MARK', 'TAPE_OR_SEAL', 'DELIVERY_CONTEXT'],
  SUPPORTING_DOCUMENT: ['DOCUMENT_OVERVIEW'],
  RETURN_CONDITION_PHOTO: ['ITEM_OVERVIEW', 'CONDITION_DETAIL', 'IDENTIFIER'],
  RETURN_PACKING_VIDEO: ['ITEM_OVERVIEW', 'IDENTIFIER', 'RETURN_PACKING_SEQUENCE', 'SEALED_PACKAGE', 'LABEL_PACKAGE_BOUNDARY', 'PP_BOUNDARY_MARK', 'TAPE_OR_SEAL', 'HIGH_RESOLUTION_REFERENCE', 'TRACKING_LABEL'],
  RETURN_SHIPPING_LABEL: ['TRACKING_LABEL', 'LABEL_PACKAGE_BOUNDARY', 'PP_BOUNDARY_MARK', 'TAPE_OR_SEAL', 'ADJACENT_PACKAGE_SURFACE'],
  RETURN_UNBOXING_VIDEO: ['SEALED_PACKAGE', 'LABEL_PACKAGE_BOUNDARY', 'PP_BOUNDARY_MARK', 'TAPE_OR_SEAL', 'OPENING_SEQUENCE', 'CONTENTS_OVERVIEW', 'IDENTIFIER', 'CONDITION_DETAIL'],
  PHYSICAL_REFERENCE_FRAME: ['PHYSICAL_CAPTURE_ROUTE_ONLY'],
  PHYSICAL_VERIFICATION_FRAME: ['PHYSICAL_CAPTURE_ROUTE_ONLY'],
};

export type CapturePreflight = {
  title: string;
  subtitle: string;
  expectations: string[];
  startLabel: string;
};

export function capturePreflightFor(type: EvidenceType): CapturePreflight {
  if (type === 'PACKING_VIDEO' || type === 'RETURN_PACKING_VIDEO') {
    return {
      title: type === 'RETURN_PACKING_VIDEO'
        ? "You're about to record the return packing process."
        : "You're about to record the packing process.",
      subtitle: 'One continuous take. Show the item, pack and seal it, then capture the label.',
      expectations: [
        'Show the item',
        'Place and seal it in the package',
        'Capture the shipping label or barcode',
      ],
      startLabel: "I'm ready",
    };
  }
  if (type === 'UNBOXING_VIDEO' || type === 'RETURN_UNBOXING_VIDEO') {
    return {
      title: type === 'RETURN_UNBOXING_VIDEO'
        ? "You're about to record the returned package being opened."
        : "You're about to record the package being opened.",
      subtitle: 'Start with the sealed package. Keep the opening in one continuous take.',
      expectations: [
        'Show the sealed package first',
        'Open it continuously on camera',
        'Show the contents before ending',
      ],
      startLabel: "I'm ready",
    };
  }
  if (type === 'SHIPPING_LABEL' || type === 'RETURN_SHIPPING_LABEL') {
    return {
      title: "You're about to photograph the sealed label.",
      subtitle: 'Fill the frame with the mark, tape or seal, and nearby cardboard.',
      expectations: [
        'Show the label on the package',
        'Include the seal and nearby cardboard',
        'Keep any barcode readable',
      ],
      startLabel: 'Take photo',
    };
  }
  if (type === 'DELIVERY_PHOTO') {
    return {
      title: "You're about to photograph the arrived package.",
      subtitle: 'Do this before opening anything.',
      expectations: [
        'Show the sealed package',
        'Include the label and seams',
        'Keep the package closed',
      ],
      startLabel: 'Take photo',
    };
  }
  return {
    title: `You're about to capture ${captureTitles[type].toLowerCase()}.`,
    subtitle: 'Capture an original photo in PackProof so it stays connected to this transaction.',
    expectations: (captureChecklists[type] ?? captureChecklists.CONDITION_PHOTO ?? []).slice(0, 3),
    startLabel: 'Start capture',
  };
}

export function captureReviewChecklist(type: EvidenceType, observations: { barcodeCaptured?: boolean; videoRecorded?: boolean; photoCaptured?: boolean }): { label: string; done: boolean }[] {
  if (type === 'PACKING_VIDEO' || type === 'RETURN_PACKING_VIDEO') {
    return [
      { label: 'Item shown', done: Boolean(observations.videoRecorded) },
      { label: 'Packed and sealed', done: Boolean(observations.videoRecorded) },
      { label: 'Barcode captured', done: Boolean(observations.barcodeCaptured) },
    ];
  }
  if (type === 'UNBOXING_VIDEO' || type === 'RETURN_UNBOXING_VIDEO') {
    return [
      { label: 'Sealed package shown', done: Boolean(observations.videoRecorded) },
      { label: 'Opening recorded', done: Boolean(observations.videoRecorded) },
    ];
  }
  if (type === 'SHIPPING_LABEL' || type === 'RETURN_SHIPPING_LABEL') {
    return [
      { label: 'Photo captured', done: Boolean(observations.photoCaptured) },
      { label: 'Barcode captured', done: Boolean(observations.barcodeCaptured) },
    ];
  }
  return [
    { label: 'Photo captured', done: Boolean(observations.photoCaptured || observations.videoRecorded) },
  ];
}

export function captureGuideFor(type: EvidenceType, isVideo: boolean): CaptureGuide {
  return isVideo ? (videoGuides[type] ?? defaultVideoGuide) : captureGuides[type] ?? defaultPhotoGuide;
}

export function formatCaptureDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function formatCaptureBytes(sizeBytes: number | null): string {
  if (sizeBytes === null) return 'Size unavailable';
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
