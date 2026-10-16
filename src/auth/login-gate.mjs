// At most one pending action per owner. A cancelled login never runs the action.
export function createLoginGate({ getUser, requestLogin }) {
  let pending = null
  let generation = 0
  return {
    run(action) {
      if (pending) return pending
      const current = generation
      pending = Promise.resolve().then(async () => {
        if (!getUser() && !await requestLogin()) return false
        if (current !== generation || !getUser()) return false
        await action(getUser())
        return true
      }).finally(() => { pending = null })
      return pending
    },
    cancel() { generation++ },
  }
}
