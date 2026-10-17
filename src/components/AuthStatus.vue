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
    <button
      class="account-trigger"
      type="button"
      aria-haspopup="dialog"
      :aria-label="state.isLoggedIn ? `${state.user.nickname}，打开个人中心` : '游客，点击登录'"
      @click="state.isLoggedIn ? openProfile() : openLogin()"
    >
      <span class="avatar-frame" aria-hidden="true">
        <span class="avatar"><img v-if="isAvatarImage(state.user?.avatar)" :src="state.user.avatar" alt=""><span v-else>{{ avatarInitial(state.user?.nickname) }}</span></span>
        <svg class="frame-spark" viewBox="0 0 12 12" fill="none"><path d="m6 1 1.4 3.6L11 6 7.4 7.4 6 11 4.6 7.4 1 6l3.6-1.4L6 1Z" fill="currentColor" /></svg>
      </span>
      <span class="identity"><strong :title="state.user?.nickname || '游客'">{{ state.user?.nickname || '游客' }}</strong></span>
    </button>
    <p v-if="state.mode === 'demo'" class="hint">仅用于体验账号流程，未接入手机号、邮箱或携程授权。</p>
    <p v-if="state.notice" role="status">{{ state.notice }}</p>
    <span class="sr-only" role="status">{{ state.isLoggedIn ? '已登录' : '当前为游客' }}</span>
  </section>
</template>

<style scoped>
.auth-status { padding: 14px 18px; border: 1px solid var(--line); border-radius: 14px; background: #fff; }
.account-trigger { display: flex; align-items: center; gap: 10px; min-height: 48px; max-width: 100%; padding: 3px 10px 3px 4px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--ink); font: inherit; cursor: pointer; transition: background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out); }
.account-trigger:hover { background: #eaf4ff; border-color: #d6e9ff; }
.avatar-frame { position: relative; display: grid; place-items: center; width: 42px; height: 42px; flex: none; border-radius: 50%; }
.avatar-frame::before { content: ''; position: absolute; inset: 0; border: 1px solid #98d6ff; border-top-color: #2377ed; border-right-color: #37c6dc; border-radius: inherit; transform: rotate(-24deg); transition: transform var(--motion-normal) var(--ease-out); }
.account-trigger:hover .avatar-frame::before, .account-trigger:focus-visible .avatar-frame::before { transform: rotate(24deg); }
.avatar { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid #d5eaff; border-radius: 50%; color: var(--brand); background: linear-gradient(145deg, #e8f7ff, #dceaff); }
.avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.frame-spark { position: absolute; top: -1px; right: -1px; width: 10px; height: 10px; color: #21b7d3; filter: drop-shadow(0 0 2px #fff); }
.identity { display: block; min-width: 0; }
.identity strong { display: block; max-width: 22ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.hint { margin: 10px 0 0; font-size: 12px; color: var(--ink-2); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media(max-width:600px){.identity strong{max-width:14ch}.account-trigger{font-size:14px}}
@media(prefers-reduced-motion:reduce){.account-trigger,.avatar-frame::before{transition:none}}
</style>
