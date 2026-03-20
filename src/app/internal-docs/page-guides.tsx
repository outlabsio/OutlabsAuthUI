import type { ReactNode } from 'react'

export type AppPageGuideSection = {
  title: string
  description: string
  bullets?: string[]
}

export type AppPageGuide = {
  label: string
  title: string
  description: string
  quickFacts?: Array<{
    label: string
    value: string
  }>
  sections: AppPageGuideSection[]
  footerNote?: ReactNode
}

type AppPageGuideRegistryEntry = AppPageGuide & {
  pathPrefix: string
}

const pageGuides: AppPageGuideRegistryEntry[] = [
  {
    pathPrefix: '/app/dashboard',
    label: 'Dashboard',
    title: 'Dashboard guide',
    description:
      'Use the dashboard to orient yourself before making access changes. It is the fastest place to confirm what system you are in and which workspace to open next.',
    quickFacts: [
      { label: 'Best for', value: 'Orientation and navigation' },
      { label: 'Primary focus', value: 'Current auth workspace state' },
      {
        label: 'Next step',
        value: 'Move into Account, API Keys, Users, Permissions, Roles, Entities, or Settings',
      },
    ],
    sections: [
      {
        title: 'What this console manages',
        description:
          'The app is organized around linked self-service and admin surfaces for accounts, users, permissions, roles, entities, machine credentials, and backend settings.',
        bullets: [
          'Account handles your own profile, password, and session-facing lifecycle details.',
          'API keys manage machine access for the current account.',
          'Permissions define capabilities.',
          'Roles bundle permissions and decide where they apply.',
          'Entities provide hierarchy and assignment context.',
          'Users receive access through direct roles or entity memberships.',
          'Settings expose backend-managed entity type defaults.',
        ],
      },
      {
        title: 'Recommended review flow',
        description:
          'Start broad, then move into the object that explains the behavior you are trying to confirm.',
        bullets: [
          'Check Permissions when you need to understand a capability or ABAC rule.',
          'Check Roles when you need to understand scope, inheritance, or blast radius.',
          'Check Entities when the question depends on hierarchy or local assignment context.',
          'Check Users when you need to audit a person’s effective access.',
          'Check API Keys for machine credentials and rotation history.',
          'Check Settings when entity type defaults or root constraints are involved.',
        ],
      },
    ],
    footerNote:
      'Use the page guide for deep context and the small info icons for quick definitions without leaving your current flow.',
  },
  {
    pathPrefix: '/app/account',
    label: 'Account',
    title: 'Account guide',
    description:
      'The Account workspace is the self-service surface for the currently signed-in user. Use it when you need to update your own identity fields, password, or verify whether a lockout is still active.',
    quickFacts: [
      { label: 'Best for', value: 'Self-service profile and password updates' },
      { label: 'Primary focus', value: 'Current `/users/me` contract' },
      { label: 'Watch for', value: 'Active lockout windows and password timestamps' },
    ],
    sections: [
      {
        title: 'What changes here',
        description:
          'This page only affects the currently authenticated user. It does not replace the broader admin user-detail flow.',
        bullets: [
          'Profile edits map to `PATCH /users/me`.',
          'Password changes map to `POST /users/me/change-password`.',
          'Lifecycle and session metadata comes from `GET /users/me`.',
        ],
      },
      {
        title: 'Operational reminders',
        description:
          'Self-service flows still follow the same backend lifecycle rules used elsewhere in the system.',
        bullets: [
          'A temporary lockout window blocks fresh login issuance until it expires.',
          'Password changes update the audit trail and last-password-change timestamp.',
          'Email changes still require a usable unique address under the retained-user model.',
        ],
      },
    ],
  },
  {
    pathPrefix: '/app/api-keys',
    label: 'API Keys',
    title: 'API Keys guide',
    description:
      'The API Keys workspace is for current-user machine credentials. Use it to create secrets, rotate them safely, and narrow where integrations can operate.',
    quickFacts: [
      { label: 'Best for', value: 'Machine credential management' },
      { label: 'Primary focus', value: 'Lifecycle, scopes, and rotation' },
      { label: 'Watch for', value: 'One-time secret reveal on create/rotate' },
    ],
    sections: [
      {
        title: 'Secret handling',
        description:
          'The backend only returns the full secret at creation and rotation time, so operational hygiene matters here.',
        bullets: [
          'Store the secret immediately after create or rotate.',
          'Subsequent reads only expose the prefix and metadata.',
          'Rotation replaces the old secret rather than revealing it again.',
        ],
      },
      {
        title: 'Safe scoping',
        description:
          'API keys can be narrowed with explicit scopes, optional IP restrictions, and optional entity restrictions.',
        bullets: [
          'Use scopes to limit the capability surface.',
          'Use IP restrictions for trusted integration origins.',
          'Use entity restrictions when a machine integration should only operate in one branch.',
        ],
      },
    ],
  },
  {
    pathPrefix: '/app/users',
    label: 'Users',
    title: 'Users guide',
    description:
      'The Users workspace is for auditing and updating account-level access. It helps you answer who a person is, where they belong, and why they can do something.',
    quickFacts: [
      { label: 'Best for', value: 'Account review and access audits' },
      { label: 'Primary focus', value: 'Identity, lifecycle, and assignments' },
      { label: 'Watch for', value: 'Direct roles versus entity memberships' },
    ],
    sections: [
      {
        title: 'Identity versus access',
        description:
          'A user record stores profile and lifecycle information. Access comes from assignments layered on top of that record.',
        bullets: [
          'Profile fields describe the account owner.',
          'Status badges describe lifecycle state such as invited, active, or suspended.',
          'Effective permissions are the result of all direct and inherited grants.',
        ],
      },
      {
        title: 'How assignments work',
        description:
          'Users can receive access in two different ways, and those paths should be reviewed separately.',
        bullets: [
          'Direct roles apply to the account itself.',
          'Entity memberships attach the user to an entity and can grant scoped roles there.',
          'Entity hierarchy can expand what a role affects when the role uses hierarchy scope.',
        ],
      },
      {
        title: 'Common audit questions',
        description:
          'Most user investigations can be resolved by comparing direct roles, entity memberships, and effective permissions.',
        bullets: [
          'Why can this person perform an action?',
          'Is this access coming from one local membership or from a broader inherited role?',
          'Does the account still need each assignment that appears on the page?',
        ],
      },
    ],
  },
  {
    pathPrefix: '/app/permissions',
    label: 'Permissions',
    title: 'Permissions guide',
    description:
      'Permissions are the smallest capability objects in the system. This workspace is where you mint custom permissions, review existing ones, and attach permission-level ABAC rules.',
    quickFacts: [
      { label: 'Smallest unit', value: 'Permission' },
      { label: 'Scope owner', value: 'Role' },
      { label: 'Runtime narrowing', value: 'ABAC conditions' },
    ],
    sections: [
      {
        title: 'Core mental model',
        description:
          'Permissions describe what an action is, but they do not decide where that action is valid.',
        bullets: [
          'Permissions are capability atoms like `lead:create` or `entity:update_tree`.',
          'Roles decide scope, inheritance, and blast radius.',
          'ABAC narrows runtime use.',
        ],
      },
      {
        title: 'System versus custom permissions',
        description:
          'System permissions are protected by design. Custom permissions exist so product-specific capabilities can be modeled without changing code-level defaults.',
        bullets: [
          'System permissions are read-only and safe from accidental mutation.',
          'Custom permissions can be created, edited, tagged, and removed.',
          'Inactive permissions stay in the catalog but should not be used for new grants.',
        ],
      },
      {
        title: 'Recommended workflow',
        description:
          'Create the permission first, then add it to the right roles after you confirm the intended blast radius.',
        bullets: [
          'Name the permission around a clear resource and action.',
          'Use tags and descriptions so operators can find it later.',
          'Add ABAC only when runtime context really needs to narrow the grant.',
        ],
      },
    ],
  },
  {
    pathPrefix: '/app/roles',
    label: 'Roles',
    title: 'Roles guide',
    description:
      'Roles are the main access-composition layer. This workspace is where you decide which permissions travel together and how far those permissions should reach.',
    quickFacts: [
      { label: 'Role shapes', value: 'Global, organization, entity-defined' },
      { label: 'Blast radius', value: 'Controlled by scope and ownership' },
      { label: 'Safety flags', value: 'System, auto-assigned, ABAC' },
    ],
    sections: [
      {
        title: 'Role shapes',
        description:
          'Every role belongs to one of three categories, and that category determines who can manage it and where it can be assigned.',
        bullets: [
          'Visible everywhere. Managed by superusers only.',
          'Owned by one root scope and assignable across that organization.',
          'Defined at one entity. Scope mode decides whether it stays local or inherits down the tree.',
        ],
      },
      {
        title: 'Scope fields that matter',
        description:
          'The role form exposes the fields that define ownership, inheritance, and assignment boundaries.',
        bullets: [
          '`root_entity` identifies the owning organization for scoped roles.',
          '`scope_entity` identifies the exact entity where an entity-defined role lives.',
          '`hierarchy` applies to descendants, while `entity_only` stays at one entity.',
          '`assignable_at_types` restricts where the role can be granted in the entity tree.',
        ],
      },
      {
        title: 'Operational safety',
        description:
          'Role management mistakes are usually scope mistakes, not permission mistakes, so read the ownership and blast-radius summaries before saving.',
        bullets: [
          'System roles are protected from destructive edits.',
          'Auto-assigned roles are meant for default membership behavior, not ad hoc grants.',
          'ABAC on roles should be used when a role needs runtime context beyond static assignment.',
        ],
      },
    ],
  },
  {
    pathPrefix: '/app/entities',
    label: 'Entities',
    title: 'Entities guide',
    description:
      'Entities define the hierarchy that scoped access depends on. This workspace is where you inspect structure, assign people to the tree, and review which roles are available at each level.',
    quickFacts: [
      { label: 'Best for', value: 'Hierarchy and scoped access review' },
      { label: 'Primary focus', value: 'Roots, descendants, and memberships' },
      { label: 'Watch for', value: 'Which roles are local versus inherited' },
    ],
    sections: [
      {
        title: 'Hierarchy as access context',
        description:
          'Entities are not just org-chart labels. They define where scoped roles live and how inherited access moves through the tree.',
        bullets: [
          'Root entities anchor organization-scoped access.',
          'Child entities create the local context for entity-defined roles and memberships.',
          'Entity type matters because some roles are only assignable at specific entity types.',
        ],
      },
      {
        title: 'Memberships and local access',
        description:
          'Entity memberships connect users to the hierarchy and can attach additional scoped roles.',
        bullets: [
          'A membership tells you where the user belongs.',
          'Local roles on a membership can expand what that user can do in that branch.',
          'Hierarchy-scoped roles can influence descendants even when granted higher up the tree.',
        ],
      },
      {
        title: 'Safe review habits',
        description:
          'Before editing an entity or membership, confirm whether the change is local to one branch or will affect downstream descendants.',
        bullets: [
          'Check the active root scope first.',
          'Review descendants before changing structure.',
          'Use the role availability panels to confirm what is assignable at this entity type.',
        ],
      },
    ],
  },
  {
    pathPrefix: '/app/settings',
    label: 'Settings',
    title: 'Settings guide',
    description:
      'The Settings workspace exposes backend-managed configuration that affects entity creation defaults and root constraints.',
    quickFacts: [
      { label: 'Best for', value: 'Entity type defaults' },
      { label: 'Primary focus', value: 'Allowed roots and child-type baselines' },
      { label: 'Write access', value: 'Superuser only' },
    ],
    sections: [
      {
        title: 'What this controls',
        description:
          'These settings shape the entity types operators can create and the suggested child types for new branches.',
        bullets: [
          'Allowed root types constrain which entity types can exist at the top of the tree.',
          'Structural defaults seed normal hierarchy creation.',
          'Access-group defaults seed authorization-oriented child branches.',
        ],
      },
      {
        title: 'Operational safety',
        description:
          'Small configuration changes can affect future entity creation across the whole backend.',
        bullets: [
          'Treat this as backend configuration, not feature-local UI state.',
          'Read-only sessions can inspect the current config, but only superusers can save.',
          'Normalize the preview before saving so the backend receives clean arrays.',
        ],
      },
    ],
  },
]

const defaultGuide: AppPageGuide = {
  label: 'Workspace',
  title: 'Workspace guide',
  description:
    'This section does not have dedicated guidance yet. Use the main workspaces to inspect users, permissions, roles, and entities.',
  sections: [
    {
      title: 'How to proceed',
      description:
        'Start from the workspace that owns the question you are trying to answer and follow the linked objects from there.',
    },
  ],
}

export function getAppPageGuide(pathname: string): AppPageGuide {
  return (
    pageGuides.find(
      (guide) =>
        pathname === guide.pathPrefix || pathname.startsWith(`${guide.pathPrefix}/`)
    ) ?? defaultGuide
  )
}
