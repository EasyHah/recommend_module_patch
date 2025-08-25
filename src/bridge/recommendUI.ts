import { ref } from 'vue';

export const recommendSidebarOpen = ref(false);

export function openRecommend(){ recommendSidebarOpen.value = true; }
export function closeRecommend(){ recommendSidebarOpen.value = false; }
export function toggleRecommend(){ recommendSidebarOpen.value = !recommendSidebarOpen.value; }
