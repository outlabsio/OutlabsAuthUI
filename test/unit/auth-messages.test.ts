import { describe, expect, it } from 'vitest'
import { accountLinkFailure, oauthErrorMessage, oauthLinkErrorMessage } from '~/utils/auth-messages'

// Account-link failures (F-104): the codes outlabs-auth 0.1.0a35's associate callback sends back
// as ?link_error=<code>&provider=<name> (routers/oauth_associate.py _associate_error_code).
describe('oauthLinkErrorMessage', () => {
  it.each([
    ['cancelled', 'Linking was cancelled', 'You cancelled at Google. Nothing changed. Link again when you are ready.'],
    ['already_linked', 'That Google account belongs to someone else', 'It is already linked to another account here. Sign in to that account and unlink it there, or link a different Google account.'],
    ['provider_conflict', 'Another Google account is already linked', 'Your account already has a different Google account linked. Unlink it first, then link this one.'],
    ['invalid_state', 'The link request expired', 'It took too long or was finished in another browser. Start again from this page.'],
    ['provider', 'Google did not complete the link', 'The provider reported an error. Try again, or link it later.'],
    ['auth', 'The server refused the link', 'Your account could not be confirmed. Sign in again and retry; if it keeps failing, ask an administrator.']
  ])('%s: a specific title and next step', (code, title, description) => {
    expect(oauthLinkErrorMessage(code, 'Google')).toEqual({ title, description })
  })

  it('never answers a link code with the sign-in copy', () => {
    for (const code of ['cancelled', 'already_linked', 'provider_conflict', 'invalid_state', 'provider', 'auth']) {
      expect(oauthLinkErrorMessage(code, 'Google').title).not.toBe(oauthErrorMessage(code).title)
    }
  })

  it('an unknown or future code gets the generic message', () => {
    expect(oauthLinkErrorMessage('quota_exceeded', 'GitHub')).toEqual({
      title: 'Could not link the account',
      description: 'Linking your GitHub account did not work. Try again, or link it later.'
    })
    expect(oauthLinkErrorMessage('').title).toBe('Could not link the account')
  })

  it('reads well without a provider', () => {
    expect(oauthLinkErrorMessage('cancelled', null).description).toBe('You cancelled at the provider. Nothing changed. Link again when you are ready.')
    expect(oauthLinkErrorMessage('already_linked').title).toBe('That account belongs to someone else')
    expect(oauthLinkErrorMessage('already_linked').description).toMatch(/or link a different account\.$/)
    expect(oauthLinkErrorMessage('provider_conflict', '  ').title).toBe('Another account from this provider is already linked')
    expect(oauthLinkErrorMessage('provider_conflict').description).toBe('Your account already has a different account from this provider linked. Unlink it first, then link this one.')
    expect(oauthLinkErrorMessage('provider').title).toBe('The provider did not complete the link')
    expect(oauthLinkErrorMessage('something_new').description).toBe('Linking the account did not work. Try again, or link it later.')
  })
})

describe('accountLinkFailure', () => {
  it('reads the code and the provider key from the landing', () => {
    expect(accountLinkFailure('already_linked', 'google')).toEqual({ code: 'already_linked', provider: 'google' })
    expect(accountLinkFailure(' cancelled ', 'GitHub')).toEqual({ code: 'cancelled', provider: 'github' })
    expect(accountLinkFailure('provider', 'my_idp-2')).toEqual({ code: 'provider', provider: 'my_idp-2' })
  })

  it('is null without a code', () => {
    expect(accountLinkFailure(undefined, 'google')).toBeNull()
    expect(accountLinkFailure('', 'google')).toBeNull()
    expect(accountLinkFailure(['cancelled'], 'google')).toBeNull()
  })

  it('drops a provider that is not a provider key, so a crafted link cannot write the message', () => {
    expect(accountLinkFailure('cancelled', undefined)).toEqual({ code: 'cancelled', provider: null })
    expect(accountLinkFailure('cancelled', 'Call 555 0100 to restore access')).toEqual({ code: 'cancelled', provider: null })
    expect(accountLinkFailure('cancelled', '<b>google</b>')).toEqual({ code: 'cancelled', provider: null })
    expect(accountLinkFailure('cancelled', ['google'])).toEqual({ code: 'cancelled', provider: null })
    expect(accountLinkFailure('cancelled', 'x'.repeat(65))).toEqual({ code: 'cancelled', provider: null })
  })
})
