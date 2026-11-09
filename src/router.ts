import { createRouter, createWebHashHistory } from 'vue-router'
import { configurata } from './lib/impostazioni'

export const router = createRouter({
  // Hash: GitHub Pages non sa servire index.html per percorsi come /receipt-analyzer/spese/123
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', redirect: '/spese' },
    { path: '/spese', component: () => import('./views/SpeseView.vue') },
    { path: '/nuova', component: () => import('./views/NuovaView.vue') },
    // la spesa appena letta o scritta a mano, non ancora salvata
    { path: '/spese/nuova', component: () => import('./views/SpesaView.vue') },
    { path: '/spese/:id', component: () => import('./views/SpesaView.vue') },
    { path: '/saldi', component: () => import('./views/SaldiView.vue') },
    { path: '/impostazioni', component: () => import('./views/ImpostazioniView.vue') },
    { path: '/configura', component: () => import('./views/ConfiguraView.vue') },
  ],
})

router.beforeEach((to) => {
  const libere = ['/impostazioni', '/configura']
  if (!configurata.value && !libere.includes(to.path)) return { path: '/impostazioni' }
})
