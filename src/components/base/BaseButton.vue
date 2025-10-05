<template>
  <button
    :class="[
      'ui-btn',
      `ui-btn--${variant}`,
      size && `ui-btn--${size}`,
      { 'is-loading': loading, 'is-block': block }
    ]"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <span class="ui-btn__loader" v-if="loading"></span>
    <span class="ui-btn__content"><slot /></span>
  </button>
</template>
<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
}
withDefaults(defineProps<Props>(), {
  variant: 'ghost',
  size: 'md',
  disabled: false,
  loading: false,
  block: false
})
defineEmits<{ (e:'click', ev:MouseEvent): void }>()
</script>
<style scoped>
.ui-btn{ 
  --_h: 32px;
  --_pad-x: 12px;
  position: relative;
  display:inline-flex; align-items:center; justify-content:center;
  gap:6px;
  height: var(--_h);
  padding: 0 var(--_pad-x);
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: 1;
  border-radius: var(--radius-btn);
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  background: rgba(255,255,255,.06);
  color: var(--color-text-primary);
  transition: background .16s ease, color .16s ease, border-color .16s ease, box-shadow .16s ease;
}
.ui-btn:hover:not(:disabled){ background: rgba(255,255,255,.10); }
.ui-btn:active:not(:disabled){ background: rgba(255,255,255,.14); }
.ui-btn:focus-visible{ outline: none; box-shadow: var(--focus-outline); }
.ui-btn:disabled{ opacity: var(--opacity-disabled); cursor:not-allowed; }

/* Variants */
.ui-btn--primary{ background: var(--color-brand); color:#fff; }
.ui-btn--primary:hover:not(:disabled){ background: color-mix(in srgb, var(--color-brand) 90%, #fff); }
.ui-btn--primary:active:not(:disabled){ background: color-mix(in srgb, var(--color-brand) 80%, #000); }

.ui-btn--outline{ background: transparent; border-color: var(--color-border); }
.ui-btn--outline:hover:not(:disabled){ background: rgba(255,255,255,.08); }

.ui-btn--ghost{ background: rgba(255,255,255,.06); border-color: var(--color-border); }

.ui-btn--danger{ background: var(--color-error); color:#fff; }
.ui-btn--danger:hover:not(:disabled){ background: #b62626; }

/* Sizes */
.ui-btn--sm{ --_h: 26px; --_pad-x: 10px; font-size: 12px; }
.ui-btn--lg{ --_h: 42px; --_pad-x: 20px; font-size: 15px; }

/* Block */
.is-block{ width:100%; }

/* Loading */
.is-loading{ pointer-events:none; }
.ui-btn__loader{ width:14px; height:14px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation: spin 0.7s linear infinite; }
@keyframes spin{ to{ transform: rotate(360deg); } }
</style>
