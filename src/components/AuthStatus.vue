<script setup>
import { onUnmounted, shallowRef } from 'vue'
import { isAvatarImage, avatarInitial } from '../auth/profile.mjs'
import { getAuthSession } from '../auth/session.mjs'
import { openLoginDialog } from '../auth/login-dialog.mjs'
import { openProfileDialog } from '../auth/profile-dialog.mjs'
import '../auth/login-dialog.css'
const auth = getAuthSession()
const state = shallowRef(auth.getSnapshot())
const unsubscribe = auth.subscribe(value => { state.value = value })
let closeProfile
function openProfile() { closeProfile = openProfileDialog() }
let closeLogin
function openLogin() { closeLogin = openLoginDialog() }
onUnmounted(() => { unsubscribe(); closeLogin?.(); closeProfile?.() })
</script>

<template>
  <section class="auth-status" :aria-label="state.mode === 'demo' ? '演示账号' : '账号'">
    <div class="account-row">
      <span class="avatar" aria-hidden="true"><img v-if="isAvatarImage(state.user?.avatar)" :src="state.user.avatar" alt=""><span v-else>{{ avatarInitial(state.user?.nickname) }}</span></span>
      <div class="identity">
        <strong>{{ state.user?.nickname || '游客' }}</strong>
        <span>{{ state.mode === 'demo' ? '演示账号 · ' : '' }}{{ state.isLoggedIn ? '已登录' : '未登录' }}</span>
      </div>
      <template v-if="state.isLoggedIn">
        <button type="button" @click="openProfile">个人中心</button>
        <button type="button" @click="auth.logout()">退出登录</button>
      </template>
      <button v-else type="button" @click="openLogin">{{ state.mode === 'demo' ? '体验登录（演示）' : '登录' }}</button>
    </div>
    <p v-if="state.mode === 'demo'" class="hint">仅用于体验账号流程，未接入手机号、邮箱或携程授权。</p>
    <p v-if="state.notice" role="status">{{ state.notice }}</p>
    <span class="sr-only" role="status">{{ state.isLoggedIn ? '已登录' : '当前为游客' }}</span>
  </section>
</template>

<style scoped>
.auth-status { padding: 14px 18px; border: 1px solid var(--line, #e8e2da); border-radius: 14px; background: #fff; }
.account-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: var(--brand, #a88d58); background: #f3eddf; }
.avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.identity { display: grid; gap: 3px; flex: 1; }
.identity span, .hint { font-size: 12px; color: var(--ink-2, #7a7168); }
button { padding: 8px 14px; border: 1px solid var(--line, #e8e2da); border-radius: 999px; background: #fff; color: var(--brand, #a88d58); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--brand, #a88d58); outline-offset: 3px; }
.hint { margin: 10px 0 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
