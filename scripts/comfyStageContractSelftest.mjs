#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const STAGE_ROOT = path.join(REPO_ROOT, "workflows", "comfy", "character");
const REPORT_DIR = path.join(REPO_ROOT, "out", "comfy_stage_contract_selftest");
const REPORT_PATH = path.join(REPORT_DIR, "report.json");
const PLACEHOLDER_PATTERN = /^\{\{[a-z0-9_]+\}\}$/i;
const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0pQAAAAASUVORK5CYII=";
const ADAPTER_DISALLOWED_FIELDS = ["views", "candidateCount", "baseSeed"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStructureControlKind(value) {
  if (!nonEmptyString(value)) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "lineart" || normalized === "canny" || normalized === "depth") {
    return normalized;
  }
  return null;
}

function readStringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => nonEmptyString(entry)).map((entry) => String(entry).trim()) : [];
}

function readViewScopedValue(value, view) {
  if (!isRecord(value) || !nonEmptyString(view)) {
    return undefined;
  }
  return value[String(view).trim()];
}

function readStructureControlRoleMap(value) {
  if (!isRecord(value)) {
    return {};
  }
  const out = {};
  for (const kind of ["lineart", "canny", "depth"]) {
    const roles = readStringArray(value[kind]);
    if (roles.length > 0) {
      out[kind] = roles;
    }
  }
  return out;
}

function readStructureControlPrimaryRoleMap(value) {
  if (!isRecord(value)) {
    return {};
  }
  const out = {};
  for (const kind of ["lineart", "canny", "depth"]) {
    if (nonEmptyString(value[kind])) {
      out[kind] = String(value[kind]).trim();
    }
  }
  return out;
}

function readNamedCountMap(value, allowedKeys = null) {
  if (!isRecord(value)) {
    return {};
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = nonEmptyString(key) ? String(key).trim() : "";
    if (!normalizedKey) {
      continue;
    }
    if (Array.isArray(allowedKeys) && allowedKeys.length > 0 && !allowedKeys.includes(normalizedKey)) {
      continue;
    }
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
      out[normalizedKey] = raw;
    }
  }
  return out;
}

function readNamedNumberMap(value, allowedKeys = null) {
  if (!isRecord(value)) {
    return {};
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = nonEmptyString(key) ? String(key).trim() : "";
    if (!normalizedKey) {
      continue;
    }
    if (Array.isArray(allowedKeys) && allowedKeys.length > 0 && !allowedKeys.includes(normalizedKey)) {
      continue;
    }
    if (isFiniteNumber(raw)) {
      out[normalizedKey] = raw;
    }
  }
  return out;
}

function readStructureControlRangeMap(value) {
  if (!isRecord(value)) {
    return {};
  }
  const out = {};
  for (const kind of ["lineart", "canny", "depth"]) {
    const entry = isRecord(value[kind]) ? value[kind] : null;
    if (!entry || !isFiniteNumber(entry.min) || !isFiniteNumber(entry.max) || entry.min > entry.max) {
      continue;
    }
    out[kind] = {
      min: entry.min,
      max: entry.max
    };
  }
  return out;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function substituteBase64(value) {
  if (!nonEmptyString(value)) {
    return null;
  }
  const trimmed = value.trim();
  return PLACEHOLDER_PATTERN.test(trimmed) ? ONE_PIXEL_PNG_BASE64 : trimmed;
}

function validateBase64Field(fieldPath, value, failures) {
  const resolved = substituteBase64(value);
  if (!resolved) {
    failures.push(`${fieldPath}: missing_base64`);
    return;
  }
  try {
    const decoded = Buffer.from(resolved, "base64");
    if (decoded.byteLength === 0) {
      failures.push(`${fieldPath}: empty_base64_decode`);
    }
  } catch (error) {
    failures.push(`${fieldPath}: invalid_base64 (${error instanceof Error ? error.message : String(error)})`);
  }
}

function expectedArtifactContractWarning(manifest, warnings) {
  const artifacts = Array.isArray(manifest?.output_contract?.expected_artifacts)
    ? manifest.output_contract.expected_artifacts
    : [];
  if (artifacts.includes("summary.json")) {
    warnings.push("artifact_contract_drift: worker emits *_workflow_summary.json while manifest lists summary.json");
  }
}

function validateStageManifest(manifestPath) {
  const failures = [];
  const warnings = [];
  const manifest = readJson(manifestPath);
  const stageDir = path.basename(path.dirname(manifestPath));
  const fileStem = path.basename(manifestPath, ".stage.json");

  if (!isRecord(manifest)) {
    return {
      manifestPath,
      status: "failed",
      failures: ["manifest_invalid_shape"],
      warnings
    };
  }

  const stage = manifest.stage;
  const templateVersion = manifest.template_version;
  const samplePayloadName = manifest.sample_payload;
  const samplePayloadPath =
    nonEmptyString(samplePayloadName) ? path.join(path.dirname(manifestPath), samplePayloadName.trim()) : null;

  if (!nonEmptyString(manifest.schema_version)) failures.push("manifest.schema_version_missing");
  if (!nonEmptyString(stage)) failures.push("manifest.stage_missing");
  if (!nonEmptyString(templateVersion)) failures.push("manifest.template_version_missing");
  if (!nonEmptyString(manifest.runtime_compiler)) failures.push("manifest.runtime_compiler_missing");
  if (!nonEmptyString(samplePayloadName)) failures.push("manifest.sample_payload_missing");
  if (!Array.isArray(manifest?.control_stack?.required_nodes) || manifest.control_stack.required_nodes.length === 0) {
    failures.push("manifest.control_stack.required_nodes_missing");
  }
  if (!Array.isArray(manifest?.output_contract?.approved_views) || manifest.output_contract.approved_views.length === 0) {
    failures.push("manifest.output_contract.approved_views_missing");
  }
  if (!isRecord(manifest.runtime_contract)) {
    failures.push("manifest.runtime_contract_missing");
  }
  const requiredStructureKinds = Array.isArray(manifest?.runtime_contract?.required_structure_control_kinds)
    ? manifest.runtime_contract.required_structure_control_kinds
        .map((entry) => normalizeStructureControlKind(entry))
        .filter((entry) => entry !== null)
    : [];
  const preferredStructureModes = Array.isArray(manifest?.structure_policy?.preferred_modes)
    ? manifest.structure_policy.preferred_modes
        .map((entry) => normalizeStructureControlKind(entry))
        .filter((entry) => entry !== null)
    : [];
  if (requiredStructureKinds.length > 0) {
    const missingPreferred = requiredStructureKinds.filter((entry) => !preferredStructureModes.includes(entry));
    const unexpectedPreferred = preferredStructureModes.filter((entry) => !requiredStructureKinds.includes(entry));
    if (missingPreferred.length > 0 || unexpectedPreferred.length > 0) {
      failures.push("manifest.structure_policy_preferred_modes_mismatch");
    }
    if (manifest?.runtime_contract?.structure_control_requirement === "required" &&
      manifest?.reference_policy?.prefer_structure_controlled_edit !== true) {
      failures.push("manifest.structure_control_requirement_without_prefer_structure_controlled_edit");
    }
  }
  if (stage !== stageDir) failures.push(`manifest.stage_dir_mismatch (${stageDir} != ${String(stage)})`);
  if (templateVersion !== fileStem) failures.push(`manifest.file_stem_mismatch (${fileStem} != ${String(templateVersion)})`);
  if (!samplePayloadPath || !fs.existsSync(samplePayloadPath)) {
    failures.push(`manifest.sample_payload_not_found (${String(samplePayloadPath)})`);
  }

  let payload = null;
  if (samplePayloadPath && fs.existsSync(samplePayloadPath)) {
    payload = readJson(samplePayloadPath);
    if (!isRecord(payload)) {
      failures.push("payload_invalid_shape");
    } else {
      const referenceBank = Array.isArray(payload.referenceBank) ? payload.referenceBank : [];
      const payloadView = nonEmptyString(payload.view) ? String(payload.view).trim() : "";
      const runtimeContract = isRecord(manifest.runtime_contract) ? manifest.runtime_contract : null;
      const structurePolicy = isRecord(manifest.structure_policy) ? manifest.structure_policy : null;
      const requiredSourceTraceFields = runtimeContract
        ? readStringArray(runtimeContract.require_structure_control_source_trace_fields)
        : [];
      const allowedSourceRolesByKind = structurePolicy
        ? readStructureControlRoleMap(
            readViewScopedValue(structurePolicy.allowed_source_roles_by_kind_by_view, payloadView) ??
              structurePolicy.allowed_source_roles_by_kind
          )
        : {};
      const requiredPrimarySourceRoleByKind = structurePolicy
        ? readStructureControlPrimaryRoleMap(
            readViewScopedValue(structurePolicy.required_primary_source_role_by_kind_by_view, payloadView) ??
              structurePolicy.required_primary_source_role_by_kind
          )
        : {};
      const requireViewMatchForSourceRoles = structurePolicy
        ? readStringArray(structurePolicy.require_view_match_for_source_roles)
        : [];
      const disallowedSourceRoles = structurePolicy
        ? readStringArray(structurePolicy.disallowed_source_roles)
        : [];
      const minimumStructureEntriesByKind = structurePolicy
        ? readNamedCountMap(
            readViewScopedValue(structurePolicy.min_entries_by_kind_by_view, payloadView) ??
              structurePolicy.min_entries_by_kind,
            ["lineart", "canny", "depth"]
          )
        : {};
      const maximumStructureEntriesByKind = structurePolicy
        ? readNamedCountMap(
            readViewScopedValue(structurePolicy.max_entries_by_kind_by_view, payloadView) ??
              structurePolicy.max_entries_by_kind,
            ["lineart", "canny", "depth"]
          )
        : {};
      const structureStrengthRangeByKind = structurePolicy
        ? readStructureControlRangeMap(
            readViewScopedValue(structurePolicy.strength_range_by_kind_by_view, payloadView) ??
              structurePolicy.strength_range_by_kind
          )
        : {};
      const structureStartPercentRangeByKind = structurePolicy
        ? readStructureControlRangeMap(
            readViewScopedValue(structurePolicy.start_percent_range_by_kind_by_view, payloadView) ??
              structurePolicy.start_percent_range_by_kind
          )
        : {};
      const structureEndPercentRangeByKind = structurePolicy
        ? readStructureControlRangeMap(
            readViewScopedValue(structurePolicy.end_percent_range_by_kind_by_view, payloadView) ??
              structurePolicy.end_percent_range_by_kind
          )
        : {};
      const minimumStructureScheduleSpanByKind = structurePolicy
        ? readNamedNumberMap(
            readViewScopedValue(structurePolicy.min_schedule_span_by_kind_by_view, payloadView) ??
              structurePolicy.min_schedule_span_by_kind,
            ["lineart", "canny", "depth"]
          )
        : {};
      const referenceBankIdIndex = new Map();
      const referenceRoleCounts = {};
      if (payload.workflowStage !== stage) {
        failures.push(`payload.workflowStage_mismatch (${String(payload.workflowStage)} != ${String(stage)})`);
      }
      if (payload.workflowTemplateVersion !== templateVersion) {
        failures.push(
          `payload.workflowTemplateVersion_mismatch (${String(payload.workflowTemplateVersion)} != ${String(templateVersion)})`
        );
      }
      if (!isRecord(payload.stagePlan)) {
        failures.push("payload.stagePlan_missing");
      } else {
        if (payload.stagePlan.stage !== stage) {
          failures.push(`payload.stagePlan.stage_mismatch (${String(payload.stagePlan.stage)} != ${String(stage)})`);
        }
        if (payload.stagePlan.templateVersion !== templateVersion) {
          failures.push(
            `payload.stagePlan.templateVersion_mismatch (${String(payload.stagePlan.templateVersion)} != ${String(templateVersion)})`
          );
        }
        if (!nonEmptyString(payload.stagePlan.templateSpecPath)) {
          warnings.push("payload.stagePlan.templateSpecPath_missing");
        }
        if (nonEmptyString(payload.view)) {
          const views = Array.isArray(payload.stagePlan.views) ? payload.stagePlan.views : [];
          if (!views.includes(payload.view)) {
            failures.push(`payload.stagePlan.views_missing_view (${payload.view})`);
          }
        }
      }

      for (const field of ADAPTER_DISALLOWED_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
          failures.push(`payload.adapter_contract_violation (${field})`);
        }
      }

      if (manifest.stage === "front_master" && payload.view !== "front") {
        failures.push(`payload.front_master_requires_front_view (${String(payload.view)})`);
      }
      const approvedViews = Array.isArray(manifest?.output_contract?.approved_views)
        ? manifest.output_contract.approved_views
            .filter((entry) => nonEmptyString(entry))
            .map((entry) => String(entry).trim())
        : [];
      if (nonEmptyString(payload.view) && approvedViews.length > 0 && !approvedViews.includes(String(payload.view).trim())) {
        failures.push(`payload.output_contract_view_not_approved (${String(payload.view)})`);
      }
      if (isRecord(payload.stagePlan) && Array.isArray(payload.stagePlan.views) && approvedViews.length > 0) {
        const invalidStagePlanViews = payload.stagePlan.views
          .map((entry) => String(entry))
          .filter((entry) => !approvedViews.includes(entry));
        if (invalidStagePlanViews.length > 0) {
          failures.push(`payload.stagePlan_views_not_approved (${invalidStagePlanViews.join("+")})`);
        }
      }

      const payloadStructureControls = isRecord(payload.structureControls) ? payload.structureControls : null;
      if (runtimeContract) {
        if (
          runtimeContract.require_reference_mode === "img2img" &&
          payload.referenceMode !== "img2img"
        ) {
          failures.push("payload.runtime_contract_require_reference_mode_img2img");
        }
        if (runtimeContract.require_reference_image === true && !nonEmptyString(payload.referenceImageBase64)) {
          failures.push("payload.runtime_contract_missing_reference_image");
        }
        if (
          runtimeContract.pose_requirement === "required" &&
          !nonEmptyString(payload.poseImageBase64)
        ) {
          failures.push("payload.runtime_contract_missing_pose_image");
        }
        if (
          runtimeContract.repair_mask_policy === "explicit_or_reference_alpha" &&
          !nonEmptyString(payload.referenceImageBase64)
        ) {
          failures.push("payload.runtime_contract_repair_policy_missing_reference");
        }
        if (
          runtimeContract.structure_control_requirement === "required" &&
          !payloadStructureControls
        ) {
          failures.push("payload.runtime_contract_missing_structureControls");
        }
        if (Array.isArray(runtimeContract.required_structure_control_kinds) && runtimeContract.required_structure_control_kinds.length > 0) {
          const payloadStructureControlKinds = payloadStructureControls
            ? Object.keys(payloadStructureControls)
                .map((entry) => normalizeStructureControlKind(entry))
                .filter((entry) => entry !== null)
            : [];
          const missingRequiredStructureKinds = runtimeContract.required_structure_control_kinds
            .map((entry) => normalizeStructureControlKind(entry))
            .filter((entry) => entry !== null)
            .filter((entry) => !payloadStructureControlKinds.includes(entry));
          if (missingRequiredStructureKinds.length > 0) {
            failures.push(
              `payload.runtime_contract_missing_required_structure_controls:${missingRequiredStructureKinds.join("+")}`
            );
          }
        }
        const requiredReferenceRoles = readStringArray(
          readViewScopedValue(runtimeContract.required_reference_roles_by_view, payloadView) ??
            runtimeContract.required_reference_roles
        );
        if (requiredReferenceRoles.length > 0) {
          const referenceRoles = referenceBank
            .filter((entry) => isRecord(entry) && nonEmptyString(entry.role))
            .map((entry) => String(entry.role).trim());
          const missingReferenceRoles = requiredReferenceRoles.filter(
            (role) => !referenceRoles.includes(String(role))
          );
          if (missingReferenceRoles.length > 0) {
            failures.push(
              `payload.runtime_contract_missing_required_reference_roles:${missingReferenceRoles.join("+")}`
            );
          }
        }
        const minimumReferenceCountByRole = readNamedCountMap(
          readViewScopedValue(runtimeContract.min_reference_count_by_role_by_view, payloadView) ??
            runtimeContract.min_reference_count_by_role
        );
        if (Object.keys(minimumReferenceCountByRole).length > 0) {
          const payloadReferenceRoleCounts = {};
          for (const entry of referenceBank) {
            if (!isRecord(entry) || !nonEmptyString(entry.role)) {
              continue;
            }
            const role = String(entry.role).trim();
            payloadReferenceRoleCounts[role] = (payloadReferenceRoleCounts[role] ?? 0) + 1;
          }
          if (nonEmptyString(payload.referenceImageBase64)) {
            payloadReferenceRoleCounts.subject = Math.max(1, payloadReferenceRoleCounts.subject ?? 0);
          }
          for (const [role, minimumCount] of Object.entries(minimumReferenceCountByRole)) {
            const actualCount =
              typeof payloadReferenceRoleCounts[role] === "number" ? payloadReferenceRoleCounts[role] : 0;
            if (actualCount < minimumCount) {
              failures.push(`payload.runtime_contract_reference_role_count_below_min:${role}:${actualCount}:${minimumCount}`);
            }
          }
        }
      }

      if (preferredStructureModes.length > 0) {
        if (!payloadStructureControls) {
          failures.push("payload.structureControls_missing");
        } else {
          const payloadStructureControlKinds = Object.keys(payloadStructureControls)
            .map((entry) => normalizeStructureControlKind(entry))
            .filter((entry) => entry !== null);
          const missingPreferredStructureKinds = preferredStructureModes.filter(
            (entry) => !payloadStructureControlKinds.includes(entry)
          );
          if (missingPreferredStructureKinds.length > 0) {
            failures.push(`payload.structureControls_missing_preferred_modes:${missingPreferredStructureKinds.join("+")}`);
          }
          const unexpectedStructureKinds = payloadStructureControlKinds.filter(
            (entry) => !preferredStructureModes.includes(entry)
          );
          if (unexpectedStructureKinds.length > 0) {
            failures.push(`payload.structureControls_unexpected_modes:${unexpectedStructureKinds.join("+")}`);
          }
        }
      } else if (payloadStructureControls && Object.keys(payloadStructureControls).length > 0) {
        failures.push("payload.structureControls_not_allowed_for_stage");
      }

      if (payload.referenceMode === "img2img" && !nonEmptyString(payload.referenceImageBase64)) {
        failures.push("payload.referenceMode_img2img_missing_referenceImageBase64");
      }

      for (const [fieldName, value] of [
        ["referenceImageBase64", payload.referenceImageBase64],
        ["repairMaskImageBase64", payload.repairMaskImageBase64],
        ["poseImageBase64", payload.poseImageBase64]
      ]) {
        if (value !== undefined) {
          validateBase64Field(`payload.${fieldName}`, value, failures);
        }
      }

      if (payload.poseImageBase64 !== undefined && payload.referenceMode !== "img2img") {
        failures.push("payload.pose_requires_img2img_referenceMode");
      }

      for (let index = 0; index < referenceBank.length; index += 1) {
        const entry = referenceBank[index];
        if (!isRecord(entry)) {
          failures.push(`payload.referenceBank[${index}]_invalid_shape`);
          continue;
        }
        if (!nonEmptyString(entry.role)) failures.push(`payload.referenceBank[${index}].role_missing`);
        if (!nonEmptyString(entry.mimeType)) failures.push(`payload.referenceBank[${index}].mimeType_missing`);
        validateBase64Field(`payload.referenceBank[${index}].imageBase64`, entry.imageBase64, failures);
        if (!nonEmptyString(entry.id)) {
          failures.push(`payload.referenceBank[${index}].id_missing`);
        } else {
          const id = String(entry.id).trim();
          if (!referenceBankIdIndex.has(id)) {
            referenceBankIdIndex.set(id, []);
          }
          referenceBankIdIndex.get(id).push(entry);
        }
      }
      for (const [id, entries] of referenceBankIdIndex.entries()) {
        if (Array.isArray(entries) && entries.length > 1) {
          failures.push(`payload.referenceBank_duplicate_id:${id}`);
        }
      }

      if (payloadStructureControls) {
        for (const [kind, entry] of Object.entries(payloadStructureControls)) {
          const normalizedKind = normalizeStructureControlKind(kind);
          if (!normalizedKind) {
            failures.push(`payload.structureControls.${kind}_invalid_kind`);
            continue;
          }
          if (!isRecord(entry)) {
            failures.push(`payload.structureControls.${normalizedKind}_invalid_shape`);
            continue;
          }
          if (!nonEmptyString(entry.mimeType)) {
            failures.push(`payload.structureControls.${normalizedKind}.mimeType_missing`);
          }
          validateBase64Field(`payload.structureControls.${normalizedKind}.imageBase64`, entry.imageBase64, failures);
          referenceRoleCounts[normalizedKind] = (referenceRoleCounts[normalizedKind] ?? 0) + 1;
          if (entry.strength !== undefined && (!isFiniteNumber(entry.strength) || entry.strength < 0 || entry.strength > 1)) {
            failures.push(`payload.structureControls.${normalizedKind}.strength_out_of_range`);
          }
          if (
            entry.startPercent !== undefined &&
            (!isFiniteNumber(entry.startPercent) || entry.startPercent < 0 || entry.startPercent > 1)
          ) {
            failures.push(`payload.structureControls.${normalizedKind}.startPercent_out_of_range`);
          }
          if (
            entry.endPercent !== undefined &&
            (!isFiniteNumber(entry.endPercent) || entry.endPercent < 0 || entry.endPercent > 1)
          ) {
            failures.push(`payload.structureControls.${normalizedKind}.endPercent_out_of_range`);
          }
          if (
            isFiniteNumber(entry.startPercent) &&
            isFiniteNumber(entry.endPercent) &&
            entry.startPercent >= entry.endPercent
          ) {
            failures.push(`payload.structureControls.${normalizedKind}.invalid_schedule`);
          }
          const strengthRange = structureStrengthRangeByKind[normalizedKind];
          if (
            strengthRange &&
            entry.strength !== undefined &&
            (!isFiniteNumber(entry.strength) || entry.strength < strengthRange.min || entry.strength > strengthRange.max)
          ) {
            failures.push(`payload.structureControls.${normalizedKind}.strength_out_of_policy`);
          }
          const startRange = structureStartPercentRangeByKind[normalizedKind];
          if (
            startRange &&
            entry.startPercent !== undefined &&
            (!isFiniteNumber(entry.startPercent) || entry.startPercent < startRange.min || entry.startPercent > startRange.max)
          ) {
            failures.push(`payload.structureControls.${normalizedKind}.startPercent_out_of_policy`);
          }
          const endRange = structureEndPercentRangeByKind[normalizedKind];
          if (
            endRange &&
            entry.endPercent !== undefined &&
            (!isFiniteNumber(entry.endPercent) || entry.endPercent < endRange.min || entry.endPercent > endRange.max)
          ) {
            failures.push(`payload.structureControls.${normalizedKind}.endPercent_out_of_policy`);
          }
          const minimumSpan = minimumStructureScheduleSpanByKind[normalizedKind];
          if (
            isFiniteNumber(minimumSpan) &&
            isFiniteNumber(entry.startPercent) &&
            isFiniteNumber(entry.endPercent) &&
            entry.endPercent - entry.startPercent < minimumSpan
          ) {
            failures.push(`payload.structureControls.${normalizedKind}.scheduleSpan_out_of_policy`);
          }
          for (const fieldName of requiredSourceTraceFields) {
            if (!nonEmptyString(entry[fieldName])) {
              failures.push(`payload.structureControls.${normalizedKind}.${fieldName}_missing`);
            }
          }
          const sourceRole = nonEmptyString(entry.sourceRole) ? String(entry.sourceRole).trim() : "";
          const sourceRefId = nonEmptyString(entry.sourceRefId) ? String(entry.sourceRefId).trim() : "";
          const sourceView = nonEmptyString(entry.sourceView) ? String(entry.sourceView).trim() : "";
          const allowedRoles = Array.isArray(allowedSourceRolesByKind[normalizedKind])
            ? allowedSourceRolesByKind[normalizedKind]
            : [];
          if (sourceRole && disallowedSourceRoles.includes(sourceRole)) {
            failures.push(`payload.structureControls.${normalizedKind}.sourceRole_disallowed:${sourceRole}`);
          }
          if (sourceRole && allowedRoles.length > 0 && !allowedRoles.includes(sourceRole)) {
            failures.push(`payload.structureControls.${normalizedKind}.sourceRole_not_allowed:${sourceRole}`);
          }
          if (
            nonEmptyString(requiredPrimarySourceRoleByKind[normalizedKind]) &&
            sourceRole &&
            sourceRole !== requiredPrimarySourceRoleByKind[normalizedKind]
          ) {
            failures.push(
              `payload.structureControls.${normalizedKind}.sourceRole_not_primary:${requiredPrimarySourceRoleByKind[normalizedKind]}`
            );
          }
          if (sourceRole && requireViewMatchForSourceRoles.includes(sourceRole) && payloadView && sourceView !== payloadView) {
            failures.push(`payload.structureControls.${normalizedKind}.sourceView_target_mismatch:${payloadView}`);
          }
          if (sourceRefId) {
            const matches = referenceBankIdIndex.get(sourceRefId) ?? [];
            if (!Array.isArray(matches) || matches.length === 0) {
              failures.push(`payload.structureControls.${normalizedKind}.sourceRefId_not_found:${sourceRefId}`);
            } else if (matches.length > 1) {
              failures.push(`payload.structureControls.${normalizedKind}.sourceRefId_ambiguous:${sourceRefId}`);
            } else {
              const match = matches[0];
              if (sourceRole && nonEmptyString(match.role) && String(match.role).trim() !== sourceRole) {
                failures.push(`payload.structureControls.${normalizedKind}.sourceRefId_role_mismatch:${sourceRefId}`);
              }
              if (sourceView && nonEmptyString(match.view) && String(match.view).trim() !== sourceView) {
                failures.push(`payload.structureControls.${normalizedKind}.sourceRefId_view_mismatch:${sourceRefId}`);
              }
            }
          }
        }
      }

      for (const [kind, minimumCount] of Object.entries(minimumStructureEntriesByKind)) {
        const actualCount = typeof referenceRoleCounts[kind] === "number" ? referenceRoleCounts[kind] : 0;
        if (actualCount < minimumCount) {
          failures.push(`payload.structureControls.${kind}.count_below_min:${actualCount}:${minimumCount}`);
        }
      }
      for (const [kind, maximumCount] of Object.entries(maximumStructureEntriesByKind)) {
        const actualCount = typeof referenceRoleCounts[kind] === "number" ? referenceRoleCounts[kind] : 0;
        if (actualCount > maximumCount) {
          failures.push(`payload.structureControls.${kind}.count_above_max:${actualCount}:${maximumCount}`);
        }
      }

        if (manifest.stage === "repair_refine") {
          if (!referenceBank.some((entry) => isRecord(entry) && entry.role === "repair_base")) {
            failures.push("payload.repair_refine_missing_repair_base_reference");
          }
          if (!nonEmptyString(payload?.stagePlan?.repairFromCandidateId)) {
            failures.push("payload.repair_refine_missing_stagePlan.repairFromCandidateId");
          }
          if (!nonEmptyString(payload?.stagePlan?.repairFromStage)) {
            failures.push("payload.repair_refine_missing_stagePlan.repairFromStage");
          }
          if (
            Array.isArray(runtimeContract?.allowed_repair_base_stages) &&
            runtimeContract.allowed_repair_base_stages.length > 0 &&
            nonEmptyString(payload?.stagePlan?.repairFromStage) &&
            !runtimeContract.allowed_repair_base_stages.includes(String(payload.stagePlan.repairFromStage))
          ) {
            failures.push("payload.repair_refine_stagePlan.repairFromStage_not_allowed");
          }
          if (
            Array.isArray(runtimeContract?.require_gate_accepted_repair_base_views) &&
            runtimeContract.require_gate_accepted_repair_base_views.includes(String(payload.view)) &&
            payload?.stagePlan?.acceptedByGate !== true
          ) {
            failures.push("payload.repair_refine_missing_stagePlan.acceptedByGate");
          }
        }
      }
    }

  expectedArtifactContractWarning(manifest, warnings);

  return {
    stage: nonEmptyString(stage) ? stage.trim() : stageDir,
    templateVersion: nonEmptyString(templateVersion) ? templateVersion.trim() : fileStem,
    manifestPath,
    samplePayloadPath,
    status: failures.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
    failures,
    warnings
  };
}

function listStageManifestPaths() {
  const paths = [];
  for (const entry of fs.readdirSync(STAGE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dirPath = path.join(STAGE_ROOT, entry.name);
    for (const file of fs.readdirSync(dirPath)) {
      if (file.endsWith(".stage.json")) {
        paths.push(path.join(dirPath, file));
      }
    }
  }
  return paths.sort((a, b) => a.localeCompare(b));
}

function main() {
  const results = listStageManifestPaths().map(validateStageManifest);
  const failureCount = results.reduce((sum, result) => sum + result.failures.length, 0);
  const warningCount = results.reduce((sum, result) => sum + result.warnings.length, 0);
  const report = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    root: STAGE_ROOT,
    total_stages: results.length,
    failed_stages: results.filter((result) => result.status === "failed").length,
    warning_stages: results.filter((result) => result.status === "warning").length,
    failure_count: failureCount,
    warning_count: warningCount,
    results
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (failureCount > 0) {
    console.error("[comfy-stage-contract] FAIL");
    console.error(`  report=${REPORT_PATH}`);
    console.error(`  failedStages=${report.failed_stages} failures=${failureCount} warnings=${warningCount}`);
    process.exitCode = 1;
    return;
  }

  console.log("[comfy-stage-contract] PASS");
  console.log(`  report=${REPORT_PATH}`);
  console.log(`  stages=${results.length} warnings=${warningCount}`);
}

main();
