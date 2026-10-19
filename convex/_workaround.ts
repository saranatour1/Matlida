'use node'

// Nothing imports this file. Convex installs an `externalPackages` entry only
// when bundled code imports it, and these gRPC peers are loaded dynamically
// inside @photon-ai/advanced-imessage, so without these re-exports they never
// ship and Photon sends fail with a misleading "install the peers" error.
export * as _grpcJs from '@grpc/grpc-js'
export * as _niceGrpc from 'nice-grpc'
export * as _niceGrpcCommon from 'nice-grpc-common'
