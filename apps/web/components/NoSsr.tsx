import dynamic from 'next/dynamic'
import React from 'react'

// React 19's types dropped PromiseLikeOfReactNode from the union upstream
// spelled out; ReactNode is that union.
const NoSsr = (props: {
  children: React.ReactNode
}) => <React.Fragment>{props.children}</React.Fragment>

export default dynamic(() => Promise.resolve(NoSsr), {
  ssr: false,
})
