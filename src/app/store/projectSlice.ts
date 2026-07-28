typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import type {
  Project,
  BeadColor,
  OrnamentSpec,
  PatternMap,
  SymmetryConfig,
} from '@/shared/types';
import {
  FORMAT_VERSION,
  SCHEMA_VERSION,
  ORNAMENT_PRESETS,
  createDefaultPalette,
} from '@/shared/constants';
import { generateOrnamentSegments } from '@/shared/utils/geometry';

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
}

const initialState: ProjectsState = {
  projects: [],
  activeProjectId: null,
};

/** Obcina i ogranicza długość nazwy projektu. */
function sanitizeProjectName(name: string): string {
  const trimmed = name.trim().slice(0, 200);
  return trimmed || 'Bez nazwy';
}

function createNewProject(name: string, spec: OrnamentSpec): Project {
  const segments = generateOrnamentSegments(spec);
  return {
    version: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    projectId: uuidv4(),
    name: sanitizeProjectName(name),
    ornamentSpec: spec,
    // Świeża kopia palety – brak współdzielonej referencji między projektami
    palette: { colors: createDefaultPalette() },
    segments,
    patternMap: {},
    symmetry: {
      mode: 'radial',
      sourceSegmentId: segments[0]?.id ?? null,
    },
    projectionConfig: { type: 'mercator', resolution: 1024 },
    metadata: {
      author: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

// RTK używa Immer wewnętrznie – mutacje state w reducerach są bezpieczne.
const projectSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    createProject: (
      state,
      action: PayloadAction<{ name: string; presetKey?: string; customSpec?: OrnamentSpec }>
    ) => {
      const { name, presetKey, customSpec } = action.payload;
      let spec: OrnamentSpec;
      if (customSpec) {
        spec = customSpec;
      } else {
        const preset = ORNAMENT_PRESETS[presetKey ?? 'medium'];
        spec = {
          diameterMm: preset.diameterMm,
          segmentCount: preset.segmentCount,
          segmentRows: preset.segmentRows,
          constructionType: 'triangular-modular',
        };
      }
      const project = createNewProject(name, spec);
      state.projects.push(project);
      state.activeProjectId = project.projectId;
    },

    setActiveProject: (state, action: PayloadAction<string | null>) => {
      state.activeProjectId = action.payload;
    },

    deleteProject: (state, action: PayloadAction<string>) => {
      // Najpierw sprawdź czy usuwany projekt jest aktywny, zanim zmodyfikujesz listę
      if (state.activeProjectId === action.payload) {
        const remaining = state.projects.filter(
          (p) => p.projectId !== action.payload
        );
        state.activeProjectId = remaining[0]?.projectId ?? null;
      }
      state.projects = state.projects.filter(
        (p) => p.projectId !== action.payload
      );
    },

    /**
     * Import projektu. Obiekt MUSI być wcześniej zwalidowany przez
     * validateProjectJSON (Zod) w warstwie wywołującej (Dashboard).
     */
    importProject: (state, action: PayloadAction<Project>) => {
      const incoming: Project = {
        ...action.payload,
        name: sanitizeProjectName(action.payload.name),
      };
      const existing = state.projects.findIndex(
        (p) => p.projectId === incoming.projectId
      );
      if (existing >= 0) {
        state.projects[existing] = incoming;
      } else {
        state.projects.push(incoming);
      }
      state.activeProjectId = incoming.projectId;
    },

    updatePatternMap: (
      state,
      action: PayloadAction<{ projectId: string; patternMap: PatternMap }>
    ) => {
      const project = state.projects.find(
        (p) => p.projectId === action.payload.projectId
      );
      if (project) {
        project.patternMap = action.payload.patternMap;
        project.metadata.updatedAt = new Date().toISOString();
      }
    },

    addColor: (
      state,
      action: PayloadAction<{ projectId: string; color: BeadColor }>
    ) => {
      const project = state.projects.find(
        (p) => p.projectId === action.payload.projectId
      );
      if (project) {
        project.palette.colors.push(action.payload.color);
      }
    },

    removeColor: (
      state,
      action: PayloadAction<{ projectId: string; colorId: string }>
    ) => {
      const project = state.projects.find(
        (p) => p.projectId === action.payload.projectId
      );
      if (project) {
        project.palette.colors = project.palette.colors.filter(
          (c) => c.id !== action.payload.colorId
        );
      }
    },

    updateSymmetry: (
      state,
      action: PayloadAction<{ projectId: string; symmetry: SymmetryConfig }>
    ) => {
      const project = state.projects.find(
        (p) => p.projectId === action.payload.projectId
      );
      if (project) {
        project.symmetry = action.payload.symmetry;
      }
    },

    renameProject: (
      state,
      action: PayloadAction<{ projectId: string; name: string }>
    ) => {
      const project = state.projects.find(
        (p) => p.projectId === action.payload.projectId
      );
      if (project) {
        project.name = sanitizeProjectName(action.payload.name);
        project.metadata.updatedAt = new Date().toISOString();
      }
    },
  },
});

export const {
  createProject,
  setActiveProject,
  deleteProject,
  importProject,
  updatePatternMap,
  addColor,
  removeColor,
  updateSymmetry,
  renameProject,
} = projectSlice.actions;

export default projectSlice.reducer;