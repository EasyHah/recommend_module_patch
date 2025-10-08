import { ref } from 'vue'
import type { Vendor } from '@/types/recommend'

export const selectedVendor = ref<Vendor | null>(null)

export function selectVendorForMap(vendor: Vendor){
  selectedVendor.value = vendor
}
