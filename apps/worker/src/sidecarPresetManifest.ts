import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

export const SIDECAR_PRESET_MANIFEST_VERSION = "sidecar_preset_manifest_v1" as const;

type PromptTuning = {
  positive: string[];
  negative: string[];
};

type ExecutionHint = {
  minWidth?: number;
  minHeight?: number;
  stepDelta?: number;
  cfgDelta?: number;
  shiftDelta?: number;
  shiftFloor?: number;
  imageInterleaveMin?: number;
  useClipVision?: boolean;
};

type WanWorkflowHint = {
  denoise?: number;
  clipVisionCrop?: "center";
  outputCodec?: "h264";
};

type HunyuanWorkflowHint = {
  denoise?: number;
  clipVisionCrop?: "center";
  srNoiseAugmentation?: number;
  srScale?: number;
  latentUpscaleMethod?: "bilinear" | "bicubic";
  outputCodec?: "h264";
};

type ControlNetPresetPolicy = {
  prompt: PromptTuning;
  flags: {
    forceDetailProfile?: boolean;
    requireReference?: boolean;
  };
  execution: {
    wan?: ExecutionHint;
    hunyuan?: ExecutionHint;
  };
  workflow: {
    wan?: WanWorkflowHint;
    hunyuan?: HunyuanWorkflowHint;
  };
};

type ImpactPresetPolicy = {
  prompt: PromptTuning;
  flags: {
    detailImpact?: boolean;
    requireReference?: boolean;
  };
  execution: {
    wan?: ExecutionHint;
    hunyuan?: ExecutionHint;
  };
  workflow: {
    wan?: WanWorkflowHint;
    hunyuan?: HunyuanWorkflowHint;
  };
};

type QcPresetPolicy = {
  prompt: PromptTuning;
  flags: {
    strictIdentity: boolean;
    requireReference: boolean;
  };
  qc: {
    minDurationRatio: number;
    minDurationSeconds: number;
  };
  execution: {
    wan?: ExecutionHint;
    hunyuan?: ExecutionHint;
  };
  workflow: {
    wan?: WanWorkflowHint;
    hunyuan?: HunyuanWorkflowHint;
  };
};

export const SIDECAR_CONTROLNET_PRESET_MANIFEST: Record<
  SidecarControlNetPresetId,
  ControlNetPresetPolicy
> = {
  pose_depth_balance_v1: {
    prompt: {
      positive: ["preserve pose anchor", "stable depth layering", "consistent body proportions"],
      negative: ["pose drift", "warped torso depth"]
    },
    flags: {},
    execution: {
      wan: {},
      hunyuan: {}
    },
    workflow: {
      wan: {
        denoise: 0.98,
        clipVisionCrop: "center",
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.98,
        clipVisionCrop: "center",
        outputCodec: "h264"
      }
    }
  },
  pose_canny_balance_v1: {
    prompt: {
      positive: ["preserve contour fidelity", "clean silhouette edge lock", "stable limb outline"],
      negative: ["edge wobble", "outline breakup", "limb contour drift"]
    },
    flags: {},
    execution: {
      wan: {
        stepDelta: 2,
        cfgDelta: 0.05,
        shiftDelta: -0.35,
        shiftFloor: 3.5
      },
      hunyuan: {
        stepDelta: 1,
        imageInterleaveMin: 3
      }
    },
    workflow: {
      wan: {
        denoise: 0.97,
        clipVisionCrop: "center",
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.97,
        clipVisionCrop: "center",
        outputCodec: "h264"
      }
    }
  },
  profile_lineart_depth_v1: {
    prompt: {
      positive: ["preserve true side-profile contour", "one-eye readable profile", "stable muzzle silhouette"],
      negative: ["front-facing drift", "broken profile outline", "double-eye profile artifact"]
    },
    flags: {
      forceDetailProfile: true,
      requireReference: true
    },
    execution: {
      wan: {
        stepDelta: 2,
        cfgDelta: 0.1,
        useClipVision: true
      },
      hunyuan: {
        stepDelta: 2,
        cfgDelta: 0.05
      }
    },
    workflow: {
      wan: {
        denoise: 0.95,
        clipVisionCrop: "center",
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.95,
        clipVisionCrop: "center",
        outputCodec: "h264"
      }
    }
  }
};

export const SIDECAR_IMPACT_PRESET_MANIFEST: Record<SidecarImpactPresetId, ImpactPresetPolicy> = {
  broadcast_cleanup_v1: {
    prompt: {
      positive: ["broadcast-clean finish", "readable editorial framing"],
      negative: ["muddy detail", "busy texture noise"]
    },
    flags: {},
    execution: {
      wan: {},
      hunyuan: {}
    },
    workflow: {
      wan: {
        denoise: 0.99,
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.99,
        outputCodec: "h264"
      }
    }
  },
  identity_repair_detail_v1: {
    prompt: {
      positive: ["identity-safe cleanup", "crisp face landmarks", "clean paw and ear detail"],
      negative: ["face redesign", "soft identity drift", "blurred ear shape"]
    },
    flags: {
      detailImpact: true,
      requireReference: true
    },
    execution: {
      wan: {
        minWidth: 768,
        minHeight: 768,
        stepDelta: 4,
        cfgDelta: 0.15,
        useClipVision: true
      },
      hunyuan: {
        minWidth: 1280,
        minHeight: 720,
        stepDelta: 4,
        cfgDelta: 0.1
      }
    },
    workflow: {
      wan: {
        denoise: 0.96,
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.96,
        srNoiseAugmentation: 0.58,
        srScale: 1.5,
        latentUpscaleMethod: "bicubic",
        outputCodec: "h264"
      }
    }
  },
  soft_clarity_cleanup_v1: {
    prompt: {
      positive: ["soft clarity cleanup", "calm readable silhouette"],
      negative: ["dirty edges", "noisy texture"]
    },
    flags: {},
    execution: {
      wan: {},
      hunyuan: {}
    },
    workflow: {
      wan: {
        denoise: 0.95,
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.95,
        srNoiseAugmentation: 0.62,
        outputCodec: "h264"
      }
    }
  },
  soft_clarity_repair_v1: {
    prompt: {
      positive: ["soft medical explainer clarity", "gentle cleanup", "calm readable features"],
      negative: ["harsh contrast", "aggressive sharpening"]
    },
    flags: {
      detailImpact: true
    },
    execution: {
      wan: {
        minWidth: 768,
        minHeight: 768,
        stepDelta: 4,
        cfgDelta: 0.15
      },
      hunyuan: {
        minWidth: 1280,
        minHeight: 720,
        stepDelta: 4,
        cfgDelta: 0.1
      }
    },
    workflow: {
      wan: {
        denoise: 0.94,
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.94,
        srNoiseAugmentation: 0.6,
        srScale: 1.5,
        latentUpscaleMethod: "bicubic",
        outputCodec: "h264"
      }
    }
  }
};

export const SIDECAR_QC_PRESET_MANIFEST: Record<SidecarQcPresetId, QcPresetPolicy> = {
  broadcast_balanced_v1: {
    prompt: {
      positive: ["broadcast-safe readability"],
      negative: ["frame edge crop", "readability loss"]
    },
    flags: {
      strictIdentity: false,
      requireReference: false
    },
    qc: {
      minDurationRatio: 0.58,
      minDurationSeconds: 1.2
    },
    execution: {
      wan: {},
      hunyuan: {}
    },
    workflow: {
      wan: {
        denoise: 0.99,
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.99,
        outputCodec: "h264"
      }
    }
  },
  broadcast_identity_strict_v1: {
    prompt: {
      positive: ["consistent identity frame to frame", "fully readable ears tail and face", "no crop-risk composition"],
      negative: ["cropped ears", "cropped tail", "identity inconsistency", "subject cut off"]
    },
    flags: {
      strictIdentity: true,
      requireReference: true
    },
    qc: {
      minDurationRatio: 0.72,
      minDurationSeconds: 1.9
    },
    execution: {
      wan: {
        minWidth: 768,
        minHeight: 768,
        stepDelta: 4,
        cfgDelta: 0.15,
        useClipVision: true
      },
      hunyuan: {
        minWidth: 1280,
        minHeight: 720,
        stepDelta: 4,
        cfgDelta: 0.1
      }
    },
    workflow: {
      wan: {
        denoise: 0.95,
        outputCodec: "h264"
      },
      hunyuan: {
        denoise: 0.95,
        srNoiseAugmentation: 0.55,
        srScale: 1.5,
        latentUpscaleMethod: "bicubic",
        outputCodec: "h264"
      }
    }
  }
};
