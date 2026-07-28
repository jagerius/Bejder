typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import type {
  Project,
  BeadColor,
  OrnamentSpec,
  PatternMap,
  SymmetryConfig,
} from '@/shared/types';
import {
  DEFAULT_PALETTE,
  FORMAT_VERSION,
  SCHEMA_VERSION,
} from '@/shared/constants';
import { generateOrnamentSegments } from '@/shared/utils/geometry';
import { ORNAMENT_PRESETS } from '@/shared/constants';

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
}

const initialState: ProjectsState = {
  projects: [],
  activeProjectId: null,
};

function createNewProject(
  name: string,
  spec: OrnamentSpec
): Project {
  const segments = generateOrnamentSegments(spec);
  return {
    version: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    projectId: uuidv4(),
    name,
    ornamentSpec: spec,
    palette: { colors: DEFAULT_PALETTE },
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

    setActiveProject: (state, action: PayloadAction<string>) => {
      state.activeProjectId = action.payload;
    },

    deleteProject: (state, action: PayloadAction<string>) => {
      state.projects = state.projects.filter(
        (p) => p.projectId !== action.payload
      );
      if (state.activeProjectId === action.payload) {
        state.activeProjectId = state.projects[0]?.projectId ?? null;
      }
    },

    importProject: (state, action: PayloadAction<Project>) => {
      const existing = state.projects.findIndex(
        (p) => p.projectId === action.payload.projectId
      );
      if (existing >= 0) {
        state.projects[existing] = action.payload;
      } else {
        state.projects.push(action.payload);
      }
      state.activeProjectId = action.payload.projectId;
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
        project.name = action.payload.name;
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