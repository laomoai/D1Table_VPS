<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-logo">D1Table</div>
        <div class="login-subtitle">Data tables on your own server</div>
      </div>

      <n-alert v-if="errorMsg" type="error" style="margin-bottom: 16px;">
        {{ errorMsg }}
      </n-alert>
      <n-alert v-if="infoMsg" type="success" style="margin-bottom: 16px;">
        {{ infoMsg }}
      </n-alert>

      <n-form v-if="mode !== 'forgot'" @submit.prevent="submit">
        <n-form-item label="Email">
          <n-input v-model:value="email" type="text" placeholder="you@example.com" />
        </n-form-item>
        <n-form-item v-if="mode === 'register'" label="Name">
          <n-input v-model:value="name" placeholder="Display name" />
        </n-form-item>
        <n-form-item label="Password">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="At least 8 characters"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="submit">
          {{ mode === 'register' ? 'Create admin account' : 'Sign in' }}
        </n-button>
      </n-form>

      <n-form v-else @submit.prevent="sendReset">
        <n-form-item label="Email">
          <n-input v-model:value="email" placeholder="you@example.com" />
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="sendReset">
          Send reset link
        </n-button>
      </n-form>

      <div class="login-links">
        <button v-if="mode === 'login'" type="button" class="link-btn" @click="mode = 'forgot'">Forgot password</button>
        <button v-if="mode === 'login' && bootstrapOpen" type="button" class="link-btn" @click="mode = 'register'">
          First-time setup
        </button>
        <button v-if="mode !== 'login'" type="button" class="link-btn" @click="mode = 'login'">Back to sign in</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { http } from '@/api/client'
import { resetAuthState } from '@/router'

const route = useRoute()
const router = useRouter()
const email = ref('')
const name = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const mode = ref<'login' | 'register' | 'forgot'>('login')
const bootstrapOpen = ref(false)

const queryError = computed(() => {
  const err = route.query.error as string
  if (!err) return ''
  return 'Sign-in failed. Please try again.'
})

onMounted(() => {
  if (queryError.value) errorMsg.value = queryError.value
  http.get<{ data: { bootstrap: boolean } }>('/auth/setup-status')
    .then((r) => {
      bootstrapOpen.value = !!r.data.data.bootstrap
      if (bootstrapOpen.value) mode.value = 'register'
    })
    .catch(() => {})
})

async function submit() {
  errorMsg.value = ''
  infoMsg.value = ''
  loading.value = true
  try {
    if (mode.value === 'register') {
      await http.post('/auth/register', {
        email: email.value,
        password: password.value,
        name: name.value || undefined,
      })
    } else {
      await http.post('/auth/login', {
        email: email.value,
        password: password.value,
      })
    }
    resetAuthState()
    await router.replace('/')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed'
    if (msg.toLowerCase().includes('closed') || msg.toLowerCase().includes('403')) {
      errorMsg.value = 'Registration is closed. Ask an admin for an invite.'
    } else {
      errorMsg.value = msg
    }
  } finally {
    loading.value = false
  }
}

async function sendReset() {
  errorMsg.value = ''
  infoMsg.value = ''
  loading.value = true
  try {
    await http.post('/auth/forgot-password', { email: email.value })
    infoMsg.value = 'If that account exists, a reset email has been sent.'
    mode.value = 'login'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7ff 0%, #e8ecff 100%);
}
.login-card {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(79, 110, 247, 0.12);
  padding: 40px 36px 32px;
}
.login-brand {
  text-align: center;
  margin-bottom: 28px;
}
.login-logo-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  margin-bottom: 12px;
}
.login-logo {
  font-size: 28px;
  font-weight: 800;
  color: #4F6EF7;
  letter-spacing: 1px;
}
.login-subtitle {
  font-size: 13px;
  color: #999;
  margin-top: 6px;
}
.login-links {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.link-btn {
  border: 0;
  background: none;
  color: #4F6EF7;
  cursor: pointer;
  font-size: 13px;
}
</style>
