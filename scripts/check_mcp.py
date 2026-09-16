"""Opt-in MCP client smoke check; pip install mcp==2.2.0 in a separate client environment."""
import argparse,asyncio,json,os,secrets
from urllib.parse import urlsplit
import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

async def check(write):
    origin=os.environ['CADENTRAIL_URL'].rstrip('/')
    parsed=urlsplit(origin)
    if parsed.scheme not in ('https','http') or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise ValueError('CADENTRAIL_URL must be the workstation origin, without credentials or a path')
    if parsed.scheme=='http' and parsed.hostname not in ('localhost','127.0.0.1','::1'):
        raise ValueError('Use HTTPS for remote workstations')
    token=os.environ['CADENTRAIL_TOKEN']
    async with httpx2.AsyncClient(headers={'Authorization':'Bearer '+token},follow_redirects=False) as http:
        async with Client(streamable_http_client(origin+'/api/mcp',http_client=http),cache=None) as agent:
            tools=await agent.list_tools()
            capabilities=await agent.call_tool('get_capabilities',{})
            if capabilities.is_error:raise RuntimeError('Capability check failed')
            summary={'tools':len(tools.tools),'version':capabilities.structured_content['data']['version'],'connection':'PASS'}
            if write:
                result=await agent.call_tool('create_project',{'name':'MCP connection check','requestId':secrets.token_hex(16)})
                if result.is_error:raise RuntimeError('Project creation failed; verify token scopes')
                project=result.structured_content['data']
                loaded=await agent.call_tool('get_project',{'projectId':project['id']})
                assert loaded.structured_content['data']['id']==project['id']
                summary.update(projectId=project['id'],projectRoundtrip='PASS')
            print(json.dumps(summary))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write',action='store_true',help='Create one named test project; otherwise all checks are read-only')
    asyncio.run(check(parser.parse_args().write))
