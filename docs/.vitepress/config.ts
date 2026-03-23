import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Cucu Platform',
  description: 'Technical documentation for the Cucu microservices platform',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'Services', link: '/services/gateway' },
      { text: 'Guides', link: '/guides/add-new-service' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/getting-started/' },
            { text: 'Setup', link: '/getting-started/setup' },
            { text: 'Architecture Overview', link: '/getting-started/architecture' },
          ]
        },
        {
          text: 'Architecture',
          collapsed: false,
          items: [
            { text: 'System Overview', link: '/architecture/overview' },
            { text: 'Apollo Federation', link: '/architecture/federation' },
            { text: 'Service Communication', link: '/architecture/communication' },
            { text: 'Authentication Flow', link: '/architecture/auth-flow' },
            { text: 'Multi-Tenant', link: '/architecture/multi-tenant' },
            { text: 'Permission System', link: '/architecture/permissions' },
            { text: 'Service Startup', link: '/architecture/startup' },
          ]
        },
        {
          text: 'Services',
          collapsed: false,
          items: [
            { text: 'Gateway', link: '/services/gateway' },
            { text: 'Auth', link: '/services/auth' },
            { text: 'Grants', link: '/services/grants' },
            { text: 'Group Assignments', link: '/services/group-assignments' },
            { text: 'Holidays', link: '/services/holidays' },
            { text: 'Milestone to Project', link: '/services/milestone-to-project' },
            { text: 'Milestone to User', link: '/services/milestone-to-user' },
            { text: 'Milestones', link: '/services/milestones' },
            { text: 'Organization', link: '/services/organization' },
            { text: 'Project Access', link: '/services/project-access' },
            { text: 'Projects', link: '/services/projects' },
            { text: 'Tenants', link: '/services/tenants' },
            { text: 'Users', link: '/services/users' },
            { text: 'Audit', link: '/services/audit' },
            { text: 'Bootstrap', link: '/services/bootstrap' },
          ]
        },
        {
          text: 'Shared Libraries',
          collapsed: false,
          items: [
            { text: 'Service Common', link: '/shared/service-common' },
            { text: 'Field-Level Grants', link: '/shared/field-level-grants' },
            { text: 'Microservices Orchestrator', link: '/shared/microservices-orchestrator' },
            { text: 'Permission Rules', link: '/shared/permission-rules' },
            { text: 'Project Utils', link: '/shared/project-utils' },
            { text: 'Security', link: '/shared/security' },
            { text: 'Tenant DB', link: '/shared/tenant-db' },
          ]
        },
        {
          text: 'Guides',
          collapsed: false,
          items: [
            { text: 'Add New Service', link: '/guides/add-new-service' },
            { text: 'Add New Field', link: '/guides/add-new-field' },
            { text: 'Add New Permission', link: '/guides/add-new-permission' },
            { text: 'Debugging', link: '/guides/debugging' },
          ]
        },
        {
          text: 'Reference',
          collapsed: false,
          items: [
            { text: 'Port Assignments', link: '/reference/ports' },
            { text: 'RPC Patterns', link: '/reference/rpc-patterns' },
            { text: 'Environment Variables', link: '/reference/env-vars' },
            { text: 'Technical Debt', link: '/reference/technical-debt' },
          ]
        },
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/CucuProject/cucu-nest' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Cucu Platform Documentation',
      copyright: 'Copyright © 2024 Cucu Team'
    },

    editLink: {
      pattern: 'https://github.com/CucuProject/cucu-docs/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    lastUpdated: {
      text: 'Updated at',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'medium'
      }
    }
  },

  ignoreDeadLinks: [
    /^http:\/\/localhost/,
  ],

  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  }
})
