<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import type { Scene } from '../types/studio'

const props = defineProps<{
  scenes: Scene[]
  activeSceneId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'add'): void
  (e: 'rename', id: string, name: string): void
  (e: 'duplicate', id: string): void
  (e: 'remove', id: string): void
}>()

const renamingScene = ref<Scene | null>(null)
const renameText = ref('')

function startRename(scene: Scene): void {
  renamingScene.value = scene
  renameText.value = scene.name
}

function submitRename(): void {
  if (renamingScene.value && renameText.value.trim()) {
    emit('rename', renamingScene.value.id, renameText.value.trim())
  }
  renamingScene.value = null
}
</script>

<template>
  <div class="scene-strip">
    <div
      v-for="scene in scenes"
      :key="scene.id"
      class="scene-pill"
      :class="{ active: scene.id === activeSceneId }"
      @click="emit('select', scene.id)"
    >
      <span class="scene-name">{{ scene.name }}</span>
      <div v-if="scene.id === activeSceneId" class="scene-actions" @click.stop>
        <button class="mini-btn" type="button" title="Ganti Nama" @click="startRename(scene)">
          <Pencil :size="13" />
        </button>
        <button class="mini-btn" type="button" title="Gandakan" @click="emit('duplicate', scene.id)">
          <Copy :size="13" />
        </button>
        <button
          v-if="scenes.length > 1"
          class="mini-btn danger"
          type="button"
          title="Hapus Scene"
          @click="emit('remove', scene.id)"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <button class="scene-add-btn" type="button" @click="emit('add')">
      <Plus :size="15" />
      <span>Tambah Scene</span>
    </button>
  </div>

  <!-- Modal Ganti Nama Scene -->
  <div v-if="renamingScene" class="modal-backdrop" @click.self="renamingScene = null">
    <div class="modal-card" style="max-width: 380px">
      <div class="modal-header">
        <h3 class="modal-title">Ganti Nama Scene</h3>
      </div>
      <input
        v-model="renameText"
        class="input"
        type="text"
        placeholder="Nama scene"
        @keyup.enter="submitRename"
      />
      <div class="modal-footer">
        <button class="btn" type="button" @click="renamingScene = null">Batal</button>
        <button class="btn btn-primary" type="button" @click="submitRename">Simpan</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0;
}

.scene-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.scene-pill.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}

.scene-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.mini-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mini-btn:hover {
  background: rgba(61, 111, 165, 0.14);
}

.mini-btn.danger {
  color: var(--record);
}

.scene-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px dashed var(--accent);
  background: var(--surface);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.scene-add-btn:hover {
  background: var(--accent-soft);
}
</style>
