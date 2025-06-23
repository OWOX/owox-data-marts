import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('serve', () => {
  it('runs serve cmd', async () => {
    const {stdout} = await runCommand('serve')
    expect(stdout).to.contain('hello world')
  })

  it('runs serve --name oclif', async () => {
    const {stdout} = await runCommand('serve --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
