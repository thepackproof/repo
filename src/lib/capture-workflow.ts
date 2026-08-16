export type CaptureStage = 'CHECKLIST' | 'CAMERA' | 'REVIEW' | 'UPLOADING';
export type PhysicalCaptureStage = 'INTRO' | 'CAMERA' | 'REVIEW' | 'SECURING';

const TRANSITIONS: Record<CaptureStage, readonly CaptureStage[]> = {
  CHECKLIST: ['CAMERA'],
  CAMERA: ['REVIEW'],
  REVIEW: ['CAMERA', 'UPLOADING'],
  UPLOADING: ['REVIEW'],
};

const PHYSICAL_TRANSITIONS: Record<PhysicalCaptureStage, readonly PhysicalCaptureStage[]> = {
  INTRO: ['CAMERA'],
  CAMERA: ['REVIEW', 'INTRO'],
  REVIEW: ['CAMERA', 'SECURING'],
  SECURING: ['REVIEW'],
};

export function canTransitionCaptureStage(from: CaptureStage, to: CaptureStage): boolean {
  return TRANSITIONS[from].includes(to);
}

export function canTransitionPhysicalCaptureStage(from: PhysicalCaptureStage, to: PhysicalCaptureStage): boolean {
  return PHYSICAL_TRANSITIONS[from].includes(to);
}

export function canDiscardReviewedCapture(stage: CaptureStage, securing: boolean): boolean {
  return stage === 'REVIEW' && !securing;
}

export function canDiscardPhysicalSeries(stage: PhysicalCaptureStage, securing: boolean): boolean {
  return stage === 'REVIEW' && !securing;
}

export function shouldDeleteLocalCaptureOnUnmount(securing: boolean, hasLocalUri: boolean): boolean {
  return hasLocalUri && !securing;
}

export function shouldDeletePhysicalFramesOnUnmount(securing: boolean, frameCount: number): boolean {
  return frameCount > 0 && !securing;
}

export function physicalSeriesIsComplete(capturedCount: number, requiredCount: number): boolean {
  return capturedCount === requiredCount && requiredCount > 0;
}

export function shouldDeletePhysicalSourceAfterEachEncrypt(): boolean {
  return false;
}

export function shouldDeletePhysicalOriginalsAfterSeriesCommit(encryptedSeriesCommitted: boolean): boolean {
  return encryptedSeriesCommitted;
}

export function captureForegroundInterruption(recording: boolean): { stopRecording: boolean; message: string } {
  if (recording) {
    return {
      stopRecording: true,
      message: 'Recording stopped because PackProof left the foreground. Retake the evidence as one continuous recording.',
    };
  }
  return {
    stopRecording: false,
    message: 'Capture cancelled because PackProof left the foreground. Return to the camera and retake the evidence.',
  };
}
