import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessNotice,AccessSettings } from './AccessSettings';

describe('access guidance',()=>{
  it('explains that open mode also opens the API',()=>{
    const html=renderToStaticMarkup(<AccessNotice onSetup={()=>{}}/>);
    expect(html).toContain('Anyone who can reach this address');
    expect(html).toContain('app and its API');
    expect(html).toContain('Set up password');
  });
  it('gives owner-controlled setup instructions without collecting a password',()=>{
    const html=renderToStaticMarkup(<AccessSettings protectedAccess={false} close={()=>{}}/>);
    expect(html).toContain('DAW_PASSWORD');
    expect(html).toContain('Edit Pod');
    expect(html).toContain('Reload this app and sign in');
    expect(html).not.toContain('<input');
    expect(html).toContain('Password protection is off');
  });
  it('clearly identifies a protected installation',()=>{
    const html=renderToStaticMarkup(<AccessSettings protectedAccess close={()=>{}}/>);
    expect(html).toContain('Password protection is on');
    expect(html).toContain('Sign-in is required');
    expect(html).not.toContain('Password protection is off');
  });
});
