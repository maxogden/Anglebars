(function ( Anglebars ) {

	'use strict';

	var utils = Anglebars.utils;

	Anglebars.Data = function ( o ) {
		var key;

		this.data = {};

		for ( key in o ) {
			if ( o.hasOwnProperty( key ) ) {
				this.data[ key ] = o[ key ];
			}
		}

		this.pendingResolution = [];
		this.subscriptions = {};
	};

	Anglebars.Data.prototype = {
		set: function ( address, value ) {
			var k, keys, key, obj, i, numUnresolved, numResolved, unresolved, resolved, index, previous;

			// allow multiple values to be set in one go
			if ( typeof address === 'object' ) {
				for ( k in address ) {
					if ( address.hasOwnProperty( k ) ) {
						this.set( k, address[k] );
					}
				}
			}

			else {
				// find previous value
				previous = this.get( address );

				// split key path into keys
				keys = address.split( '.' );

				obj = this.data;
				while ( keys.length > 1 ) {
					key = keys.shift();
					obj = obj[ key ] || {};
				}

				key = keys[0];

				obj[ key ] = value;

				if ( !utils.isEqual( previous, value ) ) {
					this.publish( address, value );
				}
			}

			// see if we can resolve any of the unresolved addresses (if such there be)
			i = this.pendingResolution.length;

			while ( i-- ) { // work backwards, so we don't go in circles
				unresolved = this.pendingResolution.splice( i, 1 )[0];
				this.getAddress( unresolved.item, unresolved.item.keypath, unresolved.item.contextStack, unresolved.callback );
			}
		},

		get: function ( address ) {
			var keys, result;

			if ( !address ) {
				return '';
			}

			keys = address.split( '.' );

			result = this.data;
			while ( keys.length ) {
				result = result[ keys.shift() ];

				if ( result === undefined ) {
					return '';
				}
			}

			return result;
		},

		getAddress: function ( item, keypath, contextStack, callback ) {

			// TODO refactor this, it's fugly

			var keys, keysClone, innerMost, result, contextStackClone, address;

			contextStack = ( contextStack ? contextStack.concat() : [] );
			contextStackClone = contextStack.concat();

			while ( contextStack ) {

				innerMost = ( contextStack.length ? contextStack[ contextStack.length - 1 ] : null );
				keys = ( innerMost ? innerMost.split( '.' ).concat( keypath.split( '.' ) ) : keypath.split( '.' ) );
				keysClone = keys.concat();

				result = this.data;
				while ( keys.length ) {
					result = result[ keys.shift() ];
				
					if ( result === undefined ) {
						break;
					}
				}

				if ( result !== undefined ) {
					address = keysClone.join( '.' );
					item.address = address;
					callback.call( item, address );
					break;
				}

				if ( contextStack.length ) {
					contextStack.pop();
				} else {
					contextStack = false;
				}
			}

			// if we didn't figure out the address, add this to the unresolved list
			if ( result === undefined ) {
				this.registerUnresolvedAddress( item, callback );
			}
		},

		registerUnresolvedAddress: function ( item, onResolve ) {
			this.pendingResolution[ this.pendingResolution.length ] = {
				item: item,
				callback: onResolve
			};
		},

		cancelAddressResolution: function ( item ) {
			this.pendingResolution = this.pendingResolution.filter( function ( pending ) {
				return pending.item !== item;
			});
		},

		publish: function ( address, value ) {
			var self = this, subscriptionsGroupedByLevel = this.subscriptions[ address ] || [], i, j, level, subscription;

			for ( i=0; i<subscriptionsGroupedByLevel.length; i+=1 ) {
				level = subscriptionsGroupedByLevel[i];

				if ( level ) {
					for ( j=0; j<level.length; j+=1 ) {
						subscription = level[j];

						if ( address !== subscription.originalAddress ) {
							value = self.get( subscription.originalAddress );
						}
						subscription.callback( value );
					}
				}
			}
		},

		subscribe: function ( address, level, callback ) {
			
			var self = this, originalAddress = address, subscriptionRefs = [], subscribe;

			if ( !address ) {
				return undefined;
			}

			subscribe = function ( address ) {
				var subscriptions, subscription;

				subscriptions = self.subscriptions[ address ] = self.subscriptions[ address ] || [];
				subscriptions = subscriptions[ level ] = subscriptions[ level ] || [];

				subscription = {
					callback: callback,
					originalAddress: originalAddress
				};

				subscriptions[ subscriptions.length ] = subscription;
				subscriptionRefs[ subscriptionRefs.length ] = {
					address: address,
					level: level,
					subscription: subscription
				};
			};

			while ( address.lastIndexOf( '.' ) !== -1 ) {
				subscribe( address );

				// remove the last item in the address, so that data.set( 'parent', { child: 'newValue' } ) affects views dependent on parent.child
				address = address.substr( 0, address.lastIndexOf( '.' ) );
			}

			subscribe( address );

			return subscriptionRefs;
		},

		unsubscribe: function ( subscriptionRef ) {
			var levels, subscriptions, index;

			levels = this.subscriptions[ subscriptionRef.address ];
			if ( !levels ) {
				// nothing to unsubscribe
				return;
			}

			subscriptions = levels[ subscriptionRef.level ];
			if ( !subscriptions ) {
				// nothing to unsubscribe
				return;
			}

			index = subscriptions.indexOf( subscriptionRef.subscription );

			if ( index === -1 ) {
				// nothing to unsubscribe
				return;
			}

			// remove the subscription from the list...
			subscriptions.splice( index, 1 );

			// ...then tidy up if necessary
			if ( subscriptions.length === 0 ) {
				delete levels[ subscriptionRef.level ];
			}

			if ( levels.length === 0 ) {
				delete this.subscriptions[ subscriptionRef.address ];
			}
		},

		unsubscribeAll: function ( subscriptionRefs ) {
			while ( subscriptionRefs.length ) {
				this.unsubscribe( subscriptionRefs.shift() );
			}
		}
	};

}( Anglebars ));

