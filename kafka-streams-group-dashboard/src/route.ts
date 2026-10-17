// Hash routes (Spec 003 Behavior 1): "#/" overview, "#/group/<id>" a group; anything else is the overview.
export type Route = { page: 'overview' } | { page: 'group'; groupId: string }

export function parseRoute(hash: string, groupIds: string[]): Route {
  const m = /^#\/group\/([^/]+)$/.exec(hash)
  const id = m ? decodeURIComponent(m[1]) : null
  return id && groupIds.includes(id) ? { page: 'group', groupId: id } : { page: 'overview' }
}

export const routeHash = (r: Route) => (r.page === 'group' ? `#/group/${encodeURIComponent(r.groupId)}` : '#/')
