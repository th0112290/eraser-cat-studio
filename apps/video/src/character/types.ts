export type Vec2 = {
  x: number;
  y: number;
};

export type CharacterPackAnchorView = "front" | "threeQuarter" | "profile";

export type CharacterPackAnchorId =
  | "head_center"
  | "mouth_center"
  | "eye_near"
  | "eye_far"
  | "ear_near"
  | "ear_far"
  | "paw_anchor"
  | "tail_root";

export type CharacterPackAnchorStatus = "present" | "occluded" | "missing" | "not_applicable";

export type CharacterPackAnchor = {
  x?: number;
  y?: number;
  confidence?: number;
  status?: CharacterPackAnchorStatus;
  notes?: string;
};

export type CharacterPackAnchorViewManifest = Partial<Record<CharacterPackAnchorId, CharacterPackAnchor>>;

export type CharacterPackAnchorViewSummary = {
  present_anchor_ids?: CharacterPackAnchorId[];
  missing_anchor_ids?: CharacterPackAnchorId[];
  notes?: string;
};

export type CharacterPackAnchorSummary = {
  covered_views?: CharacterPackAnchorView[];
  missing_views?: CharacterPackAnchorView[];
  by_view?: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewSummary>>;
  notes?: string;
};

export type CharacterPackAnchorConfidenceSummary = {
  overall?: number;
  by_view?: Partial<Record<CharacterPackAnchorView, number>>;
  notes?: string;
};

export type CharacterPackAnchorManifest = {
  views?: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>>;
  summary?: CharacterPackAnchorSummary;
  confidence_summary?: CharacterPackAnchorConfidenceSummary;
};

export type CharacterPack = {
  schema_version: "1.0";
  pack_id: string;
  meta: {
    name: string;
    created_at: string;
    source_image_ref?: string;
    notes?: string;
  };
  canvas: {
    base_width: number;
    base_height: number;
    coord_space: "pixels";
  };
  assets: {
    images: Record<string, string>;
  };
  anchors?: CharacterPackAnchorManifest;
  slots: Array<{
    slot_id: string;
    default_image_id: string;
    z_index?: number;
  }>;
  skeleton: {
    bones: Array<{
      bone_id: string;
      parent_id: string;
      rest: {
        x: number;
        y: number;
        rotation_deg: number;
      };
      limits?: {
        min_rotation_deg?: number;
        max_rotation_deg?: number;
      };
    }>;
    attachments: Array<{
      slot_id: string;
      image_id: string;
      bone_id: string;
      pivot: {
        px: number;
        py: number;
      };
      offset?: {
        x?: number;
        y?: number;
      };
      scale?: {
        x?: number;
        y?: number;
      };
      rotation_deg?: number;
    }>;
  };
  visemes: Record<
    string,
    {
      slot_id: string;
      image_id: string;
    }
  >;
  expressions: Record<
    string,
    {
      slot_overrides?: Array<{
        slot_id: string;
        image_id: string;
      }>;
      bone_overrides?: Array<{
        bone_id: string;
        rotation_deg?: number;
        x?: number;
        y?: number;
      }>;
    }
  >;
  clips: Array<{
    clip_id: string;
    duration_frames: number;
    tracks: Record<string, unknown>;
  }>;
  ik_chains: Array<{
    chain_id: string;
    bones: [string, string];
    effector_bone_id: string;
    elbow_hint?: "up" | "down";
    max_stretch?: number;
  }>;
};

export type RigPose = {
  position: Vec2;
  lookTarget?: Vec2;
  pointTarget?: Vec2;
};

