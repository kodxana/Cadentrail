import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StorageStatus, type StorageInfo } from './StorageStatus';

const measured: StorageInfo={usedBytes:12e9,capacityBytes:80e9,availableBytes:68e9,source:'configured',complete:true,measuredAt:1};
describe('storage status',()=>{
  it('shows the measured usage and configured allocation in consistent units',()=>{
    const html=renderToStaticMarkup(<StorageStatus value={measured}/>);
    expect(html).toContain('12.0 GB / 80.0 GB used');
    expect(html).toContain('68.0 GB available');
  });
  it('does not invent free space for a shared host without an allowance',()=>{
    const html=renderToStaticMarkup(<StorageStatus value={{...measured,capacityBytes:null,availableBytes:null,source:'unknown'}}/>);
    expect(html).toContain('12.0 GB used · allocation unavailable');
    expect(html).not.toContain('disk free');
  });
  it('labels partial scans as a lower bound',()=>{
    expect(renderToStaticMarkup(<StorageStatus value={{...measured,complete:false,availableBytes:null}}/>)).toContain('At least 12.0 GB');
  });
});
