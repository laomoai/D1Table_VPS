<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">设置密码</div>
      <p class="login-hint">设置登录密码后即可进入墨问。至少 8 位。</p>
      <n-alert v-if="errorMsg" type="error" style="margin: 16px 0;">{{ errorMsg }}</n-alert>
      <n-form>
        <n-form-item label="新密码">
          <n-input v-model:value="password" type="password" show-password-on="click" @keyup.enter="submit" />
        </n-form-item>
        <n-form-item label="再输入一次">
          <n-input v-model:value="password2" type="password" show-password-on="click" @keyup.enter="submit" />
        </n-form-item>
        <n-button type="primary" block :loading="loading" @click="submit">保存并登录</n-button>
      </n-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { http } from '@/api/client'
import { resetAuthState } from '@/router'

const route = useRoute()
const router = useRouter()
const password = ref('')
const password2 = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function submit() {
  errorMsg.value = ''
  if (!route.query.token) {
    errorMsg.value = '链接无效，请使用邮件里的完整链接'
    return
  }
  if (password.value.length < 8) {
    errorMsg.value = '密码至少 8 位'
    return
  }
  if (password.value !== password2.value) {
    errorMsg.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    await http.post('/auth/reset-password', {
      token: String(route.query.token || ''),
      password: password.value,
    })
    resetAuthState()
    await router.replace('/')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '设置失败'
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
.login-logo {
  font-size: 24px;
  font-weight: 800;
  color: #4F6EF7;
  text-align: center;
}
.login-hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: #787774;
  text-align: center;
}
</style>
