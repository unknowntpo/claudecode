// Hash routes (Spec 003 Behavior 1, Spec 008 CL3): "#/" the cluster, "#/groups" the streams groups overview,
// "#/group/<id>" a group; anything else is the cluster.
export type Route = { page: 'cluster' } | { page: 'groups' } | { page: 'group'; groupId: string }

export function parseRoute(hash: string, groupIds: string[]): Route {
  if (hash === '#/groups') return { page: 'groups' }
  const m = /^#\/group\/([^/]+)$/.exec(hash)
  const id = m ? decodeURIComponent(m[1]) : null
  return id && groupIds.includes(id) ? { page: 'group', groupId: id } : { page: 'cluster' }
}

export const routeHash = (r: Route) =>
  r.page === 'group' ? `#/group/${encodeURIComponent(r.groupId)}` : r.page === 'groups' ? '#/groups' : '#/'
